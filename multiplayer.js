// multiplayer.js — Firebase Realtime Database layer for Line Tower Wars
// Exposes window.MP. Requires Firebase compat SDK loaded before this file.
//
// !! SETUP REQUIRED !!
// Replace the placeholder values in FIREBASE_CONFIG with your project's config.
// Get them from: Firebase Console → Project Settings → Your apps → Web app
// Then enable:  Authentication → Anonymous  AND  Realtime Database
//
// Database rules (paste into Firebase Console → Realtime Database → Rules):
// {
//   "rules": {
//     "rooms": {
//       ".indexOn": ["status", "host"],
//       "$roomId": {
//         ".read":  "auth != null",
//         ".write": "auth != null"
//       }
//     }
//   }
// }

window.MP = (function () {
  // ---------------------------------------------------------------------------
  // CONFIG — replace with your Firebase project values
  // ---------------------------------------------------------------------------
  const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyC0uEiWvp5sU9C4PBC3YJLoW2hoiHZagSA",
    authDomain:        "tower-wars-1d46b.firebaseapp.com",
    // TODO: paste your Realtime Database URL here after creating the database.
    // Find it in Firebase Console → Build → Realtime Database (looks like:
    // https://tower-wars-1d46b-default-rtdb.firebaseio.com)
    databaseURL:       "https://tower-wars-1d46b-default-rtdb.firebaseio.com",
    projectId:         "tower-wars-1d46b",
    storageBucket:     "tower-wars-1d46b.firebasestorage.app",
    messagingSenderId: "1025721278227",
    appId:             "1:1025721278227:web:b7ad7906643fbca40d84e6"
  };

  const STALE_QUEUE_MS    = 90_000;   // entries older than this are cleaned up
  const POLL_INTERVAL_MS  = 2_500;    // how often to scan queue for an opponent
  const READY_TIMEOUT_MS  = 45_000;   // max wait for opponent to submit prep data

  // ---------------------------------------------------------------------------
  // Module state
  // ---------------------------------------------------------------------------
  let db                  = null;
  let myUid               = null;
  let multiplayerAvailable = false;

  // Active match handles
  let _roomId             = null;
  let _myRole             = null;       // "host" | "guest"
  let _opponentRole       = null;       // "guest" | "host"
  let _displayName        = "Player";

  // Cleanup refs accumulated during a session
  let _pollTimer          = null;
  let _bothReadyOff       = null;
  let _disconnectOff      = null;
  let _readyTimeoutTimer  = null;

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  async function init() {
    if (FIREBASE_CONFIG.apiKey === "YOUR_API_KEY") {
      console.warn("[MP] Firebase not configured — multiplayer disabled.");
      return false;
    }
    try {
      // Avoid double-init if HMR or duplicate script load
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      const cred = await firebase.auth().signInAnonymously();
      myUid = cred.user.uid;
      db    = firebase.database();
      multiplayerAvailable = true;
      console.log("[MP] Ready. uid =", myUid);
      return true;
    } catch (err) {
      console.warn("[MP] Init failed:", err.message);
      multiplayerAvailable = false;
      return false;
    }
  }

  function isAvailable() { return multiplayerAvailable; }
  function getMyUid()    { return myUid; }

  function setDisplayName(name) {
    _displayName = (name || "Player").slice(0, 20);
  }

  function getPlatform() {
    if (window.Capacitor) return window.Capacitor.getPlatform() || "mobile";
    return "web";
  }

  // ---------------------------------------------------------------------------
  // Matchmaking  (room-based, no dual-host race condition)
  // ---------------------------------------------------------------------------
  //
  // Strategy:
  //   1. Immediately try to JOIN an existing "waiting" room as guest (atomic tx)
  //   2. If none found, CREATE a "waiting" room as host and listen for a guest
  //   3. Keep polling every POLL_INTERVAL_MS to join a room that appeared later
  //      (handles the case where two players create rooms simultaneously)
  //
  // This means exactly one player is always "host" (creator) and the other is
  // "guest" (joiner). No two players can both think they are host for the same
  // match, eliminating the original race condition.

  async function startMatchmaking(displayName, onFound, onError) {
    if (!multiplayerAvailable) {
      onError && onError(new Error("Multiplayer not available"));
      return;
    }
    setDisplayName(displayName);

    let matched = false;
    let myWaitingRoomId = null;
    let hostRoomListener = null;

    function _finish(result) {
      if (matched) return;
      matched = true;
      _stopMatchmaking();
      if (hostRoomListener) {
        db.ref(`rooms/${myWaitingRoomId}`).off("value", hostRoomListener);
        hostRoomListener = null;
      }
      _roomId       = result.roomId;
      _myRole       = result.role;
      _opponentRole = result.role === "host" ? "guest" : "host";
      onFound(result);
    }

    // Phase 1: try to join immediately
    try {
      const joinResult = await _tryJoinWaitingRoom();
      if (joinResult) {
        // Clean up our own waiting room if we created one before joining
        if (myWaitingRoomId) {
          db.ref(`rooms/${myWaitingRoomId}`).remove();
          myWaitingRoomId = null;
        }
        _finish(joinResult);
        return;
      }
    } catch (err) {
      console.warn("[MP] Initial join attempt failed:", err.message);
    }

    // Phase 2: create a waiting room and listen for a guest
    try {
      myWaitingRoomId = await _createWaitingRoom();
      await db.ref(`rooms/${myWaitingRoomId}`).onDisconnect().remove();
    } catch (err) {
      onError && onError(err);
      return;
    }

    // Listen for someone to join our room
    const roomRef = db.ref(`rooms/${myWaitingRoomId}`);
    hostRoomListener = roomRef.on("value", (snap) => {
      const room = snap.val();
      if (!room || matched) return;
      if (room.guest && room.status === "active") {
        _finish({ roomId: myWaitingRoomId, role: "host", opponentName: room.guestName || "Opponent" });
      }
    });

    // Phase 3: keep polling in case another room appeared at the same time
    _pollTimer = setInterval(async () => {
      if (matched) return;
      try {
        const joinResult = await _tryJoinWaitingRoom(myWaitingRoomId);
        if (joinResult && !matched) {
          // Delete our own waiting room since we're joining theirs
          if (myWaitingRoomId) {
            db.ref(`rooms/${myWaitingRoomId}`).remove().catch(() => {});
            myWaitingRoomId = null;
          }
          _finish(joinResult);
        }
      } catch (err) {
        console.warn("[MP] Poll error:", err.message);
      }
    }, POLL_INTERVAL_MS);
  }

  // Try to atomically join the oldest available waiting room (not our own).
  // skipRoomId: skip our own waiting room to avoid self-join.
  async function _tryJoinWaitingRoom(skipRoomId) {
    const snap = await db.ref("rooms")
      .orderByChild("status")
      .equalTo("waiting")
      .limitToFirst(20)
      .once("value");

    const rooms = snap.val() || {};
    const now = Date.now();
    const staleMs = STALE_QUEUE_MS;

    const candidates = Object.entries(rooms)
      .filter(([id, r]) =>
        id !== skipRoomId &&
        r.host !== myUid &&
        r.createdAt &&
        r.createdAt >= now - staleMs
      )
      .sort(([, a], [, b]) => a.createdAt - b.createdAt);

    for (const [roomId, room] of candidates) {
      let txResult;
      try {
        // applyLocally:false forces Firebase to use the actual server value rather
        // than the local cache, which may be null for a path we haven't directly
        // subscribed to (even if we just queried the parent).
        txResult = await db.ref(`rooms/${roomId}`).transaction(
          (current) => {
            if (!current || current.status !== "waiting" || current.guest) {
              return undefined; // already taken or gone — abort
            }
            return {
              ...current,
              status:    "active",
              guest:     myUid,
              guestName: _displayName
            };
          },
          null,   // onComplete callback — unused (we use the Promise)
          false   // applyLocally: false — use server value, not local cache
        );
      } catch (err) {
        console.warn("[MP] Transaction error on room", roomId, err.message);
        continue;
      }

      if (txResult && txResult.committed) {
        return { roomId, role: "guest", opponentName: room.hostName || "Opponent" };
      }
    }
    return null;
  }

  async function _createWaitingRoom() {
    const roomId = _generateRoomId();
    await db.ref(`rooms/${roomId}`).set({
      createdAt:  firebase.database.ServerValue.TIMESTAMP,
      status:     "waiting",
      host:       myUid,
      hostName:   _displayName,
      guest:      null,
      guestName:  null,
      hostReady:  false,
      guestReady: false,
      disconnect: { host: null, guest: null }
    });
    return roomId;
  }

  async function cancelMatchmaking() {
    _stopMatchmaking();
    // Clean up any waiting room we created
    try {
      const snap = await db.ref("rooms")
        .orderByChild("host").equalTo(myUid).once("value");
      const rooms = snap.val() || {};
      for (const [id, r] of Object.entries(rooms)) {
        if (r.status === "waiting") db.ref(`rooms/${id}`).remove();
      }
    } catch (_) { /* ignore */ }
  }

  function _stopMatchmaking() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  function _generateRoomId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------------------------------------------------------------------------
  // Presence / disconnect tracking
  // ---------------------------------------------------------------------------

  // Register server-side onDisconnect so opponent can detect drops
  async function setupPresence(roomId, role) {
    _roomId  = roomId;
    _myRole  = role;
    _opponentRole = role === "host" ? "guest" : "host";

    const presRef = db.ref(`rooms/${roomId}/disconnect/${role}`);
    await presRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
    // Clear any stale entry from a previous session
    await presRef.set(null);
  }

  // Watch for opponent presence changes.
  // onDisconnect(timestamp) — opponent dropped
  // onReconnect()           — opponent came back
  function watchOpponentPresence(onDisconnectCb, onReconnectCb) {
    if (!_roomId || !_opponentRole) return () => {};
    const ref = db.ref(`rooms/${_roomId}/disconnect/${_opponentRole}`);
    const handler = ref.on("value", (snap) => {
      const ts = snap.val();
      if (ts !== null && ts !== undefined) {
        onDisconnectCb && onDisconnectCb(ts);
      } else {
        onReconnectCb && onReconnectCb();
      }
    });
    _disconnectOff = () => ref.off("value", handler);
    return _disconnectOff;
  }

  // Clear our own disconnect marker (call on reconnect / resume)
  async function clearMyPresenceDisconnect() {
    if (!_roomId || !_myRole) return;
    try {
      await db.ref(`rooms/${_roomId}/disconnect/${_myRole}`).set(null);
    } catch (_) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Round sync
  // ---------------------------------------------------------------------------

  // Submit this player's prep-phase decisions and signal readiness.
  // data: { waveNumber, towers, queue, fanSeeds, towerUpgrades, attackerUpgrades }
  async function submitPrepData(data) {
    if (!_roomId || !_myRole) throw new Error("No active room");
    const roundRef = db.ref(`rooms/${_roomId}/rounds/${data.waveNumber}/${_myRole}`);
    await roundRef.set({
      towers:           data.towers,
      queue:            data.queue,
      fanSeeds:         data.fanSeeds,
      towerUpgrades:    data.towerUpgrades,
      attackerUpgrades: data.attackerUpgrades,
      submittedAt:      firebase.database.ServerValue.TIMESTAMP
    });
    await db.ref(`rooms/${_roomId}/${_myRole}Ready`).set(true);
  }

  // Listen until both hostReady and guestReady are true.
  // Returns a cancel function. Calls callback() once when both ready.
  function listenForBothReady(callback) {
    if (!_roomId) return () => {};
    const ref = db.ref(`rooms/${_roomId}`);
    let fired = false;

    const handler = ref.on("value", (snap) => {
      const room = snap.val();
      if (!room || fired) return;
      if (room.hostReady && room.guestReady) {
        fired = true;
        ref.off("value", handler);
        if (_bothReadyOff === handler) _bothReadyOff = null;
        callback();
      }
    });

    _bothReadyOff = handler;

    // Timeout: if opponent never submits, fire callback anyway so we don't hang
    _readyTimeoutTimer = setTimeout(() => {
      if (!fired) {
        fired = true;
        ref.off("value", handler);
        callback("timeout");
      }
    }, READY_TIMEOUT_MS);

    return () => {
      ref.off("value", handler);
      clearTimeout(_readyTimeoutTimer);
    };
  }

  // Fetch opponent's prep data for a given wave (one-time read)
  async function getOpponentPrepData(waveNumber) {
    if (!_roomId || !_opponentRole) throw new Error("No active room");
    const snap = await db.ref(`rooms/${_roomId}/rounds/${waveNumber}/${_opponentRole}`).once("value");
    return snap.val();
  }

  // Reset ready flags for the next round and write our battle score
  async function completeBattle(waveNumber, myScore) {
    if (!_roomId || !_myRole) return;
    await db.ref(`rooms/${_roomId}/rounds/${waveNumber}/${_myRole}Score`).set(myScore);
    // Only host resets the shared ready flags to avoid write conflicts
    if (_myRole === "host") {
      await db.ref(`rooms/${_roomId}/hostReady`).set(false);
      await db.ref(`rooms/${_roomId}/guestReady`).set(false);
    }
  }

  // Submit shop upgrade choice (informational — upgrades are baked into next prep submission)
  async function submitShopChoice(waveNumber, type, id) {
    if (!_roomId || !_myRole) return;
    try {
      await db.ref(`rooms/${_roomId}/rounds/${waveNumber}/${_myRole}/shopChoice`).set({ type, id });
    } catch (_) { /* non-critical */ }
  }

  // Mark room finished
  async function closeRoom() {
    if (!_roomId) return;
    try {
      await db.ref(`rooms/${_roomId}/status`).set("finished");
    } catch (_) { /* ignore */ }
    _cleanupRoomState();
  }

  function _cleanupRoomState() {
    if (_disconnectOff)     { _disconnectOff(); _disconnectOff = null; }
    if (_readyTimeoutTimer) { clearTimeout(_readyTimeoutTimer); _readyTimeoutTimer = null; }
    _roomId       = null;
    _myRole       = null;
    _opponentRole = null;
  }

  // ---------------------------------------------------------------------------
  // Data validation
  // ---------------------------------------------------------------------------

  const VALID_TOWER_IDS    = ["violet", "yellow", "red", "green", "orange", null];
  const VALID_ATTACKER_IDS = ["imp", "runner", "brute", "wisp", "tank"];

  function validatePrepData(data) {
    if (!data) return false;
    if (!Array.isArray(data.towers) || data.towers.length !== 5) return false;
    if (!Array.isArray(data.queue)) return false;
    if (!data.towers.every((t) => VALID_TOWER_IDS.includes(t))) return false;
    if (!data.queue.every((id) => VALID_ATTACKER_IDS.includes(id))) return false;
    if (data.fanSeeds !== undefined && !Array.isArray(data.fanSeeds)) return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    init,
    isAvailable,
    getMyUid,
    setDisplayName,
    startMatchmaking,
    cancelMatchmaking,
    setupPresence,
    watchOpponentPresence,
    clearMyPresenceDisconnect,
    submitPrepData,
    listenForBothReady,
    getOpponentPrepData,
    completeBattle,
    submitShopChoice,
    closeRoom,
    validatePrepData,
    get roomId()       { return _roomId; },
    get myRole()       { return _myRole; },
    get opponentRole() { return _opponentRole; }
  };
})();
