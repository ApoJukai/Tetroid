// --- FIREBASE INTEGRATION & AUTH ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, doc, setDoc, updateDoc, onSnapshot, deleteDoc, where, increment } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyChwSowRGkPaPyUvj6vjrpiHUSTjDCdsVU",
    authDomain: "tetroid-8ddc4.firebaseapp.com",
    projectId: "tetroid-8ddc4",
    storageBucket: "tetroid-8ddc4.firebasestorage.app",
    messagingSenderId: "892394499098",
    appId: "1:892394499098:web:7eea9487c5b4aa0924b5a3",
    measurementId: "G-Z2PSNG84N1"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// --- View State Elements ---
const loginView = document.getElementById('login-view');
const profileView = document.getElementById('profile-view');
const gameView = document.getElementById('game-view');
const battleView = document.getElementById('battle-view'); 

const loginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const authError = document.getElementById('auth-error');
const dashboardName = document.getElementById('dashboard-name');

let currentUser = null;

// --- AUTHENTICATION LOGIC ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        dashboardName.innerText = user.displayName ? user.displayName.toUpperCase() : "GUEST";
        loginView.classList.add('hidden');
        profileView.classList.remove('hidden');
    } else {
        currentUser = null;
        profileView.classList.add('hidden');
        gameView.classList.add('hidden');
        battleView.style.display = 'none';
        loginView.classList.remove('hidden');
    }
});

loginBtn.addEventListener('click', async () => {
    try {
        authError.style.display = 'none';
        loginBtn.innerText = "CONNECTING...";
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Auth Error:", error);
        authError.innerText = "Login failed. Please try again.";
        authError.style.display = 'block';
        loginBtn.innerText = "🎮 SIGN IN WITH GOOGLE";
    }
});

logoutBtn.addEventListener('click', () => signOut(auth));

// --- Pre-Game Profile Setup Logic ---
let selectedAvatar = '🦊';
document.querySelectorAll('.avatar-option').forEach(option => {
    option.addEventListener('click', () => {
        document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        selectedAvatar = option.innerText;
    });
});

const bgmSelect = document.getElementById('bgm-select');
const uiAvatar = document.getElementById('ui-avatar');
const uiName = document.getElementById('ui-name');
const bgMusic = document.getElementById('bg-music');
if (bgMusic) bgMusic.volume = 0.3; 

function startAudio() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (bgmSelect) {
        const selectedTrack = bgmSelect.value;
        if (selectedTrack === 'none' && bgMusic) {
            bgMusic.pause();
            bgMusic.removeAttribute('src'); 
        } else if (bgMusic) {
            bgMusic.src = selectedTrack;
            bgMusic.play().catch(e => console.log("Music file missing."));
        }
    }
}

// SOLO MODE
document.getElementById('play-solo-btn').addEventListener('click', () => {
    uiName.innerText = currentUser ? (currentUser.displayName || "GUEST") : "GUEST";
    uiAvatar.innerText = selectedAvatar;
    startAudio();
    isMultiplayer = false;
    canvas = document.getElementById('board'); 
    ctx = canvas.getContext('2d');
    
    profileView.classList.add('hidden');
    gameView.classList.remove('hidden');
    startGame();
});

// --- MULTIPLAYER & ADVANCED BATTLE STATE VARIABLES ---
let isMultiplayer = false;
let currentRoomId = null;
let isPlayer1 = false;
let unsubscribeMatch = null;
let opponentBoardState = null;
let pendingGarbage = 0;
let totalGarbageReceived = 0;

// NEW: Advanced Battle Tracking
let comboCount = 0;
let b2bActive = false;

// MULTIPLAYER SETUP
const battleCanvasSelf = document.getElementById('battle-board-self');
const battleCtxSelf = battleCanvasSelf.getContext('2d');
battleCtxSelf.scale(30, 30); 

const battleCanvasOpponent = document.getElementById('battle-board-opponent');
const battleCtxOpponent = battleCanvasOpponent.getContext('2d');
battleCtxOpponent.scale(30, 30);

document.getElementById('find-match-btn').addEventListener('click', async () => {
    uiName.innerText = currentUser ? (currentUser.displayName || "GUEST") : "GUEST";
    uiAvatar.innerText = selectedAvatar;
    startAudio();
    
    profileView.classList.add('hidden');
    battleView.style.display = 'flex'; 
    battleView.classList.remove('hidden');
    
    await findMatch();
});

document.getElementById('cancel-match-btn').addEventListener('click', async () => {
    if (currentRoomId && unsubscribeMatch) {
        unsubscribeMatch(); 
        if (isPlayer1) await deleteDoc(doc(db, "rooms", currentRoomId)); 
    }
    battleView.style.display = 'none';
    profileView.classList.remove('hidden');
    currentRoomId = null;
    isMultiplayer = false;
});

// --- MATCHMAKING LOGIC ---
async function findMatch() {
    const statusText = document.getElementById('battle-status');
    const opponentNameText = document.getElementById('opponent-name-display');
    statusText.innerText = "SEARCHING...";
    opponentNameText.innerText = "WAITING...";
    isMultiplayer = true;
    
    canvas = battleCanvasSelf; 
    ctx = battleCtxSelf;

    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("status", "==", "waiting"), limit(1));
    const snapshot = await getDocs(q);
    const playerName = currentUser ? currentUser.displayName : "GUEST";

    if (!snapshot.empty) {
        const roomDoc = snapshot.docs[0];
        currentRoomId = roomDoc.id;
        isPlayer1 = false;
        
        await updateDoc(doc(db, "rooms", currentRoomId), {
            status: "playing",
            player2: playerName,
            player2Board: Array.from({length: 20}, () => Array(10).fill(0))
        });
        
        statusText.innerText = "BATTLE!";
        opponentNameText.innerText = roomDoc.data().player1.toUpperCase();
        listenToMatch();
        startGame();
    } else {
        isPlayer1 = true;
        const newRoomRef = await addDoc(collection(db, "rooms"), {
            status: "waiting",
            player1: playerName,
            player1Board: Array.from({length: 20}, () => Array(10).fill(0)),
            player2Board: Array.from({length: 20}, () => Array(10).fill(0)),
            p1Garbage: 0,
            p2Garbage: 0
        });
        currentRoomId = newRoomRef.id;
        listenToMatch();
    }
}

function listenToMatch() {
    const statusText = document.getElementById('battle-status');
    const opponentNameText = document.getElementById('opponent-name-display');

    unsubscribeMatch = onSnapshot(doc(db, "rooms", currentRoomId), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();

        if (isPlayer1 && data.status === "playing" && !isPlaying) {
            statusText.innerText = "BATTLE!";
            opponentNameText.innerText = data.player2.toUpperCase();
            startGame();
        }

        if (isPlayer1) {
            opponentBoardState = data.player2Board;
            const incoming = data.p1Garbage || 0;
            if (incoming > totalGarbageReceived) {
                pendingGarbage += (incoming - totalGarbageReceived);
                totalGarbageReceived = incoming;
            }
        } else {
            opponentBoardState = data.player1Board;
            const incoming = data.p2Garbage || 0;
            if (incoming > totalGarbageReceived) {
                pendingGarbage += (incoming - totalGarbageReceived);
                totalGarbageReceived = incoming;
            }
        }
    });
}

// --- Game Constants & Audio Engine ---
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;

let canvas = document.getElementById('board');
let ctx = canvas.getContext('2d');

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const SoundEngine = {
    playTone: function(freq, type, duration, vol = 0.1) {
        if (audioCtx.state === 'suspended') return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    },
    move: () => SoundEngine.playTone(300, 'sine', 0.1, 0.05),
    rotate: () => SoundEngine.playTone(400, 'triangle', 0.1, 0.05),
    drop: () => SoundEngine.playTone(150, 'square', 0.15, 0.1),
    lock: () => SoundEngine.playTone(200, 'square', 0.1, 0.05),
    clear: () => {
        setTimeout(() => SoundEngine.playTone(400, 'sine', 0.1, 0.1), 0);
        setTimeout(() => SoundEngine.playTone(600, 'sine', 0.1, 0.1), 100);
        setTimeout(() => SoundEngine.playTone(800, 'sine', 0.2, 0.1), 200);
    },
    gameover: () => {
        setTimeout(() => SoundEngine.playTone(300, 'sawtooth', 0.3, 0.1), 0);
        setTimeout(() => SoundEngine.playTone(250, 'sawtooth', 0.3, 0.1), 250);
        setTimeout(() => SoundEngine.playTone(200, 'sawtooth', 0.6, 0.1), 500);
    }
};

const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
nextCtx.scale(BLOCK_SIZE, BLOCK_SIZE); 

const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
holdCtx.scale(BLOCK_SIZE, BLOCK_SIZE);

const COLORS = [null, '#00FFFF', '#0000FF', '#FFA500', '#FFFF00', '#00FF00', '#800080', '#FF0000', '#666666'];
const SHAPES = [
    [],
    [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]], 
    [[2,0,0], [2,2,2], [0,0,0]], 
    [[0,0,3], [3,3,3], [0,0,0]], 
    [[4,4], [4,4]], 
    [[0,5,5], [5,5,0], [0,0,0]], 
    [[0,6,0], [6,6,6], [0,0,0]], 
    [[7,7,0], [0,7,7], [0,0,0]]  
];

// --- Game State Variables ---
let board = Array.from({length: ROWS}, () => Array(COLS).fill(0));
let currentPiece = null;
let nextPiece = null;
let holdPiece = null;
let hasHeld = false; 

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let isPlaying = false;
let animationId = null;

let score = 0;
let lines = 0;
let level = 1;

let isAnimating = false;
let linesToClear = [];
let animationTimer = 0;
const ANIMATION_DURATION = 400; 

const scoreElement = document.getElementById('score');
const linesElement = document.getElementById('lines');
const levelElement = document.getElementById('level');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreElement = document.getElementById('final-score');
const leaderboardList = document.getElementById('leaderboard-list');

// --- 7-Bag Randomizer ---
let pieceBag = [];

function generateBag() {
    pieceBag = [1, 2, 3, 4, 5, 6, 7];
    for (let i = pieceBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pieceBag[i], pieceBag[j]] = [pieceBag[j], pieceBag[i]];
    }
}

function createPiece() {
    if (pieceBag.length === 0) generateBag();
    const typeId = pieceBag.pop();
    return { matrix: SHAPES[typeId], x: 3, y: 0 };
}

// --- Garbage Application & Hole Consistency ---
function addGarbageLines(amount) {
    // 5. Hole Consistency: Generates one hole position for this entire batch of garbage
    const holeIndex = Math.floor(Math.random() * COLS);
    
    for (let i = 0; i < amount; i++) {
        const topRow = board.shift(); 
        
        if (topRow.some(val => val !== 0)) {
            gameOver();
            return;
        }
        
        const newRow = Array(COLS).fill(8); 
        newRow[holeIndex] = 0; // Same hole for all lines in this combo/attack
        board.push(newRow); 
    }
}

// --- Helper Functions ---
function drawBlock(context, x, y, colorId) {
    context.fillStyle = COLORS[colorId];
    context.fillRect(x, y, 1, 1);
    context.fillStyle = 'rgba(255, 255, 255, 0.3)';
    context.fillRect(x, y, 1, 0.1); 
    context.fillRect(x, y, 0.1, 1); 
    context.fillStyle = 'rgba(0, 0, 0, 0.3)';
    context.fillRect(x, y + 0.9, 1, 0.1); 
    context.fillRect(x + 0.9, y, 0.1, 1); 
}

function drawGhostPiece() {
    if (!currentPiece) return;
    const ghost = { matrix: currentPiece.matrix, x: currentPiece.x, y: currentPiece.y };
    while (!collide(board, ghost)) { ghost.y++; }
    ghost.y--; 
    ctx.globalAlpha = 0.2;
    ghost.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value > 0) drawBlock(ctx, ghost.x + x, ghost.y + y, value);
        });
    });
    ctx.globalAlpha = 1.0; 
}

function drawBoard(targetCtx, targetBoard) {
    targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
    targetBoard.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value > 0) {
                if (isAnimating && linesToClear.includes(y) && targetCtx === ctx) {
                    let progress = animationTimer / ANIMATION_DURATION;
                    let size = 1 - progress; 
                    let offset = progress / 2; 
                    targetCtx.fillStyle = 'white'; 
                    targetCtx.fillRect(x + offset, y + offset, size, size);
                } else {
                    drawBlock(targetCtx, x, y, value);
                }
            }
        });
    });

    if (targetCtx === ctx && !isAnimating) {
        drawGhostPiece();
        if (currentPiece) {
            currentPiece.matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value > 0) drawBlock(targetCtx, currentPiece.x + x, currentPiece.y + y, value);
                });
            });
        }
    }
}

function drawNextPiece() {
    if(isMultiplayer) return; 
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!nextPiece) return;
    const xOffset = nextPiece.matrix.length === 4 ? 0 : 0.5;
    const yOffset = nextPiece.matrix.length === 4 ? 0 : 1;
    nextPiece.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value > 0) drawBlock(nextCtx, x + xOffset, y + yOffset, value);
        });
    });
}

function drawHoldPiece() {
    if(isMultiplayer) return; 
    holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (!holdPiece) return;
    const xOffset = holdPiece.matrix.length === 4 ? 0 : 0.5;
    const yOffset = holdPiece.matrix.length === 4 ? 0 : 1;
    holdPiece.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value > 0) drawBlock(holdCtx, x + xOffset, y + yOffset, value);
        });
    });
}

function collide(board, piece) {
    const m = piece.matrix;
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 && (board[y + piece.y] && board[y + piece.y][x + piece.x]) !== 0) {
                return true;
            }
        }
    }
    return false;
}

async function merge(board, piece) {
    SoundEngine.lock(); 
    piece.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                board[y + piece.y][x + piece.x] = value;
            }
        });
    });

    if (isMultiplayer && currentRoomId) {
        try {
            const updateData = isPlayer1 ? { player1Board: board } : { player2Board: board };
            await updateDoc(doc(db, "rooms", currentRoomId), updateData);
        } catch (e) { console.error("Sync error", e); }
    }
}

function checkLines() {
    linesToClear = [];
    for (let y = 0; y < ROWS; ++y) {
        if (board[y].every(value => value !== 0)) {
            linesToClear.push(y);
        }
    }

    if (linesToClear.length > 0) {
        SoundEngine.clear(); 
        isAnimating = true;
        animationTimer = 0;
    } else {
        // BREAK COMBO: If a piece locks and clears zero lines, reset the combo meter.
        comboCount = 0;
        spawnPiece();
    }
}

async function gameOver() {
    isPlaying = false;
    SoundEngine.gameover();
    if (bgMusic && typeof bgMusic.pause === 'function') bgMusic.pause();

    if (isMultiplayer) {
        document.getElementById('battle-status').innerText = "YOU LOSE!";
        if (unsubscribeMatch) unsubscribeMatch();
        if (isPlayer1) setTimeout(() => deleteDoc(doc(db, "rooms", currentRoomId)), 3000); 
    } else {
        finalScoreElement.innerText = score;
        gameOverScreen.classList.remove('hidden');

        if (score > 0 && currentUser) {
            try {
                const playerName = currentUser.displayName || "GUEST";
                const playerAvatar = uiAvatar.innerText || "🦊";
                await addDoc(collection(db, "leaderboard"), {
                    name: playerName, avatar: playerAvatar, score: score, timestamp: new Date()
                });
            } catch (error) { console.error("Error saving score:", error); }
        }
    }
}

function spawnPiece() {
    if (pendingGarbage > 0) {
        addGarbageLines(pendingGarbage);
        pendingGarbage = 0;
        
        if (isMultiplayer && currentRoomId) {
            const updateData = isPlayer1 ? { player1Board: board } : { player2Board: board };
            updateDoc(doc(db, "rooms", currentRoomId), updateData);
        }
    }

    if (!nextPiece) nextPiece = createPiece();
    currentPiece = nextPiece;
    nextPiece = createPiece();
    hasHeld = false; 
    drawNextPiece();

    if (collide(board, currentPiece)) {
        gameOver();
    }
}

// Controls
function playerDrop(isHardDrop = false) {
    currentPiece.y++;
    if (collide(board, currentPiece)) {
        currentPiece.y--;
        merge(board, currentPiece);
        checkLines(); 
    } else if (!isHardDrop) {
        SoundEngine.move();
    }
    dropCounter = 0;
}

function playerMove(dir) {
    currentPiece.x += dir;
    if (collide(board, currentPiece)) {
        currentPiece.x -= dir; 
    } else {
        SoundEngine.move();
    }
}

function playerRotate() {
    const pos = currentPiece.x;
    let offset = 1;
    for (let y = 0; y < currentPiece.matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
            [currentPiece.matrix[x][y], currentPiece.matrix[y][x]] = [currentPiece.matrix[y][x], currentPiece.matrix[x][y]];
        }
    }
    currentPiece.matrix.forEach(row => row.reverse());

    while (collide(board, currentPiece)) {
        currentPiece.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > currentPiece.matrix[0].length) {
            currentPiece.matrix.forEach(row => row.reverse());
            for (let y = 0; y < currentPiece.matrix.length; ++y) {
                for (let x = 0; x < y; ++x) {
                    [currentPiece.matrix[x][y], currentPiece.matrix[y][x]] = [currentPiece.matrix[y][x], currentPiece.matrix[x][y]];
                }
            }
            currentPiece.x = pos;
            return;
        }
    }
    SoundEngine.rotate();
}

function playerHold() {
    if (hasHeld || isMultiplayer) return; 
    SoundEngine.move(); 

    if (holdPiece === null) {
        holdPiece = { matrix: currentPiece.matrix, x: 3, y: 0 };
        spawnPiece();
    } else {
        const temp = { matrix: currentPiece.matrix, x: 3, y: 0 };
        currentPiece = holdPiece;
        holdPiece = temp;
        currentPiece.x = 3;
        currentPiece.y = 0;
    }
    hasHeld = true;
    drawHoldPiece();
}

document.addEventListener('keydown', event => {
    if (!isPlaying || isAnimating || !currentPiece) return;

    switch(event.keyCode) {
        case 37: playerMove(-1); break;
        case 39: playerMove(1); break;
        case 40: playerDrop(); break;
        case 38: playerRotate(); break;
        case 32: 
            SoundEngine.drop();
            while (!collide(board, currentPiece)) { currentPiece.y++; }
            currentPiece.y--; 
            playerDrop(true);     
            break;
        case 67: playerHold(); break;
    }
});

function update(time = 0) {
    if (!isPlaying) return;

    const deltaTime = time - lastTime;
    lastTime = time;

    if (isAnimating) {
        animationTimer += deltaTime;
        if (animationTimer >= ANIMATION_DURATION) {
            isAnimating = false;
            
            linesToClear.forEach(y => {
                board.splice(y, 1);
                board.unshift(Array(COLS).fill(0));
            });

            const linesCleared = linesToClear.length;
            
            // --- ADVANCED BATTLE LOGIC START ---
            
            // 2. The Combo Algorithm
            comboCount++; // Increment combo (1st clear = combo 1, 2nd clear = combo 2)
            
            // 1. The Attack Table
            let baseGarbage = 0;
            let isDifficult = false;
            if (linesCleared === 2) baseGarbage = 1;
            if (linesCleared === 3) baseGarbage = 2;
            if (linesCleared === 4) {
                baseGarbage = 4;
                isDifficult = true; // Tetris is considered a "difficult" move
            }

            // 3. Back-to-Back (B2B) Bonus
            let b2bBonus = 0;
            if (isDifficult) {
                if (b2bActive) b2bBonus = 1; // Award +1 if previous move was also difficult
                b2bActive = true; 
            } else {
                b2bActive = false; // Break the chain if we cleared 1, 2, or 3 lines
            }

            // Calculate Combo Bonus
            let comboBonus = 0;
            let comboCheck = comboCount - 1; 
            if (comboCheck >= 2 && comboCheck <= 3) comboBonus = 1;
            if (comboCheck >= 4 && comboCheck <= 5) comboBonus = 2;
            if (comboCheck >= 6 && comboCheck <= 7) comboBonus = 3;
            if (comboCheck >= 8) comboBonus = 4;

            let totalGarbageGenerated = baseGarbage + b2bBonus + comboBonus;
            console.log(`Attack! Base: ${baseGarbage}, B2B: ${b2bBonus}, Combo: ${comboBonus}`);

            // 4. Garbage Cancellation (Defense)
            if (totalGarbageGenerated > 0 && pendingGarbage > 0) {
                if (totalGarbageGenerated >= pendingGarbage) {
                    totalGarbageGenerated -= pendingGarbage;
                    pendingGarbage = 0;
                } else {
                    pendingGarbage -= totalGarbageGenerated;
                    totalGarbageGenerated = 0;
                }
            }

            // --- ADVANCED BATTLE LOGIC END ---

            if(!isMultiplayer) {
                const rowScores = [0, 100, 300, 500, 800];
                score += rowScores[linesCleared] * level;
                lines += linesCleared;
                level = Math.floor(lines / 10) + 1;
                dropInterval = Math.max(100, 1000 - (level - 1) * 100); 

                scoreElement.innerText = score;
                linesElement.innerText = lines;
                levelElement.innerText = level;
            }

            // Send remaining attack to the opponent
            if (isMultiplayer && currentRoomId) {
                const updateData = isPlayer1 ? { player1Board: board } : { player2Board: board };
                
                if (totalGarbageGenerated > 0) {
                    const targetField = isPlayer1 ? "p2Garbage" : "p1Garbage";
                    updateData[targetField] = increment(totalGarbageGenerated);
                }
                
                updateDoc(doc(db, "rooms", currentRoomId), updateData);
            }

            spawnPiece(); 
        }
        
        drawBoard(ctx, board);
        if (isMultiplayer && opponentBoardState) {
            drawBoard(battleCtxOpponent, opponentBoardState);
        }
        animationId = requestAnimationFrame(update);
        return; 
    }

    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        playerDrop();
    }

    drawBoard(ctx, board);
    if (isMultiplayer && opponentBoardState) {
        drawBoard(battleCtxOpponent, opponentBoardState);
    }

    animationId = requestAnimationFrame(update);
}

function startGame() {
    board = Array.from({length: ROWS}, () => Array(COLS).fill(0));
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = 1000;
    isAnimating = false;
    
    // Reset Battle States
    opponentBoardState = null;
    pendingGarbage = 0;
    totalGarbageReceived = 0;
    comboCount = 0;
    b2bActive = false;
    pieceBag = []; 
    
    if(!isMultiplayer) {
        scoreElement.innerText = score;
        linesElement.innerText = lines;
        levelElement.innerText = level;
        holdPiece = null;
        drawHoldPiece();
    }
    
    gameOverScreen.classList.add('hidden'); 
    isPlaying = true;
    if (bgMusic && bgMusic.src && bgMusic.src !== window.location.href) {
        bgMusic.currentTime = 0;
        bgMusic.play().catch(e => {}); 
    }
    
    spawnPiece();
    lastTime = performance.now();
    requestAnimationFrame(update);
}

document.getElementById('restart-btn').addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    gameView.classList.add('hidden');
    battleView.style.display = 'none';
    profileView.classList.remove('hidden');
});
