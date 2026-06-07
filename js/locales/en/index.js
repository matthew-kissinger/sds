// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * English Translations
 * Default language for Sheep Dog Simulator
 */

export default {
    // Common UI elements
    common: {
        back: 'Back',
        backToMenu: '← Back to Menu',
        start: 'Start',
        cancel: 'Cancel',
        confirm: 'Confirm',
        save: 'Save',
        close: 'Close',
        loading: 'Loading...',
        error: 'Error',
        retry: 'Try Again',
        refresh: 'Refresh',
        copy: 'Copy',
        copied: 'Copied!',
        you: 'You',
        host: 'Host',
        waiting: 'Waiting...',
        players: 'Players',
        player: 'Player'
    },

    // Main menu / Mode selection
    menu: {
        title: 'Sheep Dog Sim',
        soloPlay: 'Solo Play',
        soloPlayDesc: 'Practice herding at your own pace',
        local2Player: 'Local 2-Player',
        local2PlayerDesc: 'Co-op or compete on one screen',
        sandbox: 'Sandbox',
        sandboxDesc: 'Customize sheep, fences & rules',
        multiplayer: 'Multiplayer',
        multiplayerDesc: 'Compete or cooperate online',
        leaderboard: 'Leaderboard',
        leaderboardDesc: 'View global rankings',
        settings: 'Settings',
        settingsDesc: 'Adjust game settings'
    },

    // Dog selection
    dogs: {
        title: 'Choose Your Dog',
        stats: {
            speed: 'Speed',
            stamina: 'Stamina',
            control: 'Control'
        },
        jep: {
            name: 'Jep',
            breed: 'Border Collie',
            description: 'Well-balanced herder with good stamina'
        },
        pip: {
            name: 'Pip',
            breed: 'Australian Shepherd',
            description: 'Fast and agile, perfect for quick herding'
        },
        sally: {
            name: 'Sally',
            breed: 'Welsh Corgi',
            description: 'Great control but slower movement'
        },
        shiloh: {
            name: 'Shiloh',
            breed: 'German Shepherd',
            description: 'Strong and steady with excellent endurance'
        },
        georgeWashington: {
            name: 'George Washington',
            breed: 'American Foxhound',
            description: 'Tactical herder with balanced abilities'
        }
    },

    // Practice Paddock (Cycle 26 v2.1.0)
    practice: {
        hint: 'WASD or arrow keys to move · Shift to sprint'
    },

    // Game modes
    modes: {
        title: 'Choose Game Mode',
        practice: 'Just Play',
        practiceDesc: 'No timer. Just 30 sheep. Take your time.',
        classic: 'Classic Mode',
        classicDesc: 'Herd all 200 sheep to the pasture',
        extreme: 'Extreme Mode',
        extremeDesc: 'Herd all 1000 sheep - performance challenge!',
        insane: 'Insane Mode',
        insaneDesc: 'Herd all 3000 sheep - extreme challenge!',
        chaos: 'Chaos Mode',
        chaosDesc: 'Herd all 5000 sheep - absolute madness!'
    },

    // Settings panel
    settings: {
        title: 'Settings',
        // Tabs
        tabs: {
            graphics: 'Graphics',
            audio: 'Audio',
            controls: 'Controls'
        },
        // Presets
        presets: 'Performance Preset',
        performanceMode: 'Performance Mode',
        performanceOption: 'Performance',
        balancedOption: 'Balanced',
        qualityOption: 'Quality',
        // Graphics
        shadows: 'Shadows',
        shadowsDesc: 'Enable dynamic shadows (desktop only)',
        experimentalWebGpu: 'WebGPU renderer',
        experimentalWebGpuDesc: 'Experimental. Uses WebGPU when available; turn off to reload with WebGL.',
        shadowQuality: 'Shadow Quality',
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        // Audio
        audioEnabled: 'Audio Enabled',
        audioVolume: 'Audio Volume',
        // Debug
        showStats: 'Performance Stats',
        showStatsDesc: 'Show FPS and render statistics',
        // Controls
        keyBindings: 'Keyboard Controls',
        resetBindings: 'Reset to Default',
        pressKey: 'Press a key...',
        keyConflict: 'Key already used for {{action}}',
        actions: {
            moveUp: 'Move Forward',
            moveDown: 'Move Backward',
            moveLeft: 'Move Left',
            moveRight: 'Move Right',
            sprint: 'Sprint',
            pause: 'Pause'
        },
        gamepadSupport: 'Gamepad Support',
        gamepadDesc: 'Controllers are automatically detected. Use left stick to move, triggers to sprint.',
        // General
        resetDefaults: 'Reset All',
        language: 'Language'
    },

    // Sandbox setup
    sandbox: {
        title: 'Sandbox Setup',
        sheepCount: 'Sheep Count',
        numberOfSheep: 'Number of Sheep',
        behavior: 'Behavior',
        movementSpeed: 'Movement Speed',
        flockCohesion: 'Flock Cohesion',
        separationDistance: 'Separation Distance',
        fieldSize: 'Field Size',
        fieldShape: 'Field Shape',
        fenceLayout: 'Fence Layout',
        editFenceLayout: 'Edit Fence Layout',
        editCustomShape: 'Edit Custom Shape',
        drawCustomShape: 'Draw Custom Shape',
        timer: 'Timer',
        enableTimer: 'Enable Timer',
        countUp: 'Count Up',
        countUpDesc: 'Track your time',
        countdown: 'Countdown',
        countdownDesc: 'Race against time',
        timeLimit: 'Time Limit',
        winCondition: 'Win Condition',
        herdAllSheep: 'Herd All Sheep',
        herdAllSheepDesc: 'Classic completion - all sheep to pasture',
        percentageGoal: 'Percentage Goal',
        percentageGoalDesc: 'Complete when reaching target percentage',
        targetPercentage: 'Target Percentage',
        freePlay: 'Free Play',
        freePlayDesc: 'No win condition - just play!',
        startGame: 'Start Game',
        startGameWithCount: 'Start Game ({{count}} sheep)',
        tabs: {
            sheep: 'Sheep',
            field: 'Field',
            rules: 'Rules'
        },
        sizes: {
            small: 'Small',
            medium: 'Medium',
            large: 'Large',
            huge: 'Huge'
        },
        shapes: {
            square: 'Square',
            wide: 'Wide',
            tall: 'Tall',
            lShape: 'L-Shape',
            circle: 'Circle',
            diamond: 'Diamond',
            triangle: 'Triangle',
            custom: 'Custom'
        },
        fencePresets: {
            open: 'Open Field',
            openDesc: 'No internal fences',
            corridor: 'Corridor',
            corridorDesc: 'Fenced path to gate',
            funnel: 'Funnel',
            funnelDesc: 'Narrowing path to gate',
            maze: 'Maze',
            mazeDesc: 'Obstacles to navigate',
            obstacles: 'Obstacles',
            obstaclesDesc: 'Random fence obstacles',
            custom: 'Custom',
            customDesc: 'Design your own layout'
        }
    },

    // Local 2-player mode
    localMode: {
        title: 'Local 2-Player',
        coop: 'Co-op',
        coopDesc: 'Work together to herd 200 sheep',
        versus: '1v1 Race',
        versusDesc: 'First to 100 sheep wins!',
        timed: 'Timed',
        timedDesc: '3 minutes - sheep respawn!',
        player: 'Player',
        controls1: 'WASD + L.Shift',
        controls2: 'Arrows + R.Shift',
        startGame: 'Start Game',
        noLeaderboards: 'Scores in local mode are not submitted to leaderboards'
    },

    // Fence editor
    fenceEditor: {
        title: 'Fence Layout',
        fenceCount: '{{count}} fence',
        fenceCountPlural: '{{count}} fences',
        quickLayouts: 'Quick Layouts',
        tools: 'Tools',
        draw: 'Draw',
        select: 'Select',
        erase: 'Erase',
        pan: 'Pan',
        clearAll: 'Clear All',
        done: 'Done',
        dogLabel: 'DOG',
        sheepSpawn: 'Sheep Spawn',
        helpDraw: 'Click and drag to draw fences - Grid snaps to 10m',
        helpErase: 'Click on a fence to delete it',
        helpPan: 'Drag to pan - Scroll to zoom',
        helpSelect: 'Click on a fence to select it',
        presets: {
            open: 'Clear field',
            corridor: 'Guided path',
            funnel: 'Narrowing',
            maze: 'Navigate obstacles',
            obstacles: 'Random blocks'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'Multiplayer',
        publicLobbies: 'Public Lobbies',
        publicLobbiesDesc: 'Browse open games',
        createRoom: 'Create Room',
        createRoomDesc: 'Host a new game room',
        joinRoom: 'Join Room',
        joinRoomDesc: 'Enter a room code',
        quickMatch: 'Quick Match',
        quickMatchDesc: 'Find an available game',
        maxPlayers: 'Max Players',
        playersCount: '{{count}} Players',
        gameMode: 'Game Mode',
        cooperative: 'Cooperative',
        cooperativeDesc: 'Work together to herd all sheep into the pen',
        competitive: 'Competitive',
        competitiveDesc: 'Race to collect the most sheep before opponents',
        timed: 'Timed (3 min)',
        timedDesc: 'Score as many points as possible in 3 minutes',
        survival: 'Survival (co-op)',
        survivalDesc: 'Herd the flock home before dusk, then survive the wolf night together. Lose a third of the flock and the run ends.',
        roomCode: 'Room Code',
        enterRoomCode: 'Enter room code',
        leaveRoom: 'Leave Room',
        startGame: 'Start Game',
        waitingForPlayers: 'Waiting for players...'
    },

    // Lobby
    lobby: {
        title: 'Game Lobby',
        roomCode: 'Room Code',
        playersCount: 'Players ({{current}}/{{max}})',
        waitingForMore: 'Waiting for more players...'
    },

    // Leaderboard
    leaderboard: {
        title: 'Global Leaderboard',
        soloClassic: 'Solo Classic',
        soloExtreme: 'Solo Extreme',
        soloInsane: 'Solo Insane',
        soloChaos: 'Solo Chaos',
        timed: 'Timed (3 min)',
        competitive: 'Competitive',
        cooperative: 'Cooperative',
        // Cycle 59 (Counting Sheep): per-curve board tabs.
        countingIncremental: 'Counting Incremental',
        countingExponential: 'Counting Exponential',
        // Cycle 66: the Newsheepdogland survival board (peak flock size).
        survival: 'Survival',
        updated: 'Updated {{time}}',
        loading: 'Loading leaderboards...',
        noScores: 'No scores recorded yet. Be the first!',
        serverOffline: 'Server offline - Leaderboards unavailable. The server may be starting up or temporarily down.',
        loadFailed: 'Failed to load leaderboards. Please try again.',
        ranks: {
            first: '1st',
            second: '2nd',
            third: '3rd'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'Sheep',
        stamina: 'Stamina',
        time: 'Time',
        score: 'Score',
        timeRemaining: 'Time Remaining',
        complete: 'complete',
        // Cycle 59 (Counting Sheep): round-based HUD readout.
        counting: {
            round: 'Round',
            bank: 'Bank and finish'
        }
    },

    // Pause menu
    pause: {
        title: 'PAUSED',
        tapToResume: 'Tap outside to resume',
        pressEscToResume: 'Press ESC to resume',
        resume: 'Resume',
        restart: 'Restart',
        mainMenu: 'Main Menu',
        fullscreen: 'Fullscreen',
        exitFullscreen: 'Exit Fullscreen',
        // Cycle 59 (Counting Sheep): pause-menu bank affordance.
        bankAndFinish: 'Bank and finish'
    },

    // Completion screen
    completion: {
        victory: 'Victory!',
        allSheepHerded: 'All {{count}} sheep herded successfully!',
        raceComplete: 'Race Complete',
        youWon: 'You won the race!',
        playerWon: '{{name}} won!',
        timesUp: "Time's Up",
        timesUpVictory: "Time's Up - Victory!",
        youCollectedMost: 'You collected the most sheep!',
        playerCollectedMost: '{{name}} collected the most!',
        teamVictory: 'Team Victory!',
        teamMessage: 'Working together, you herded all the sheep!',
        gameComplete: 'Game Complete',
        wellPlayed: 'Well played!',
        newPersonalBest: 'NEW PERSONAL BEST!',
        finalStandings: 'Final Standings',
        playAgain: 'Play Again',
        scoreSaved: 'Saved to the leaderboard',
        scoreSaveFailed: 'Could not save your score',
        nextChallenge: 'Next Challenge',
        saveClip: 'Save dev clip',
        stats: {
            time: 'Time',
            yourScore: 'Your Score',
            raceTime: 'Race Time',
            duration: 'Duration',
            sheepCollected: 'Sheep Collected',
            teamTime: 'Team Time'
        },
        sheepUnit: '{{count}} sheep',
        // Cycle 59 (Counting Sheep): player-banked summary.
        counting: {
            title: 'Sheep counted',
            subtitle: 'You counted {{count}} before banking the run.',
            counted: 'Counted',
            round: 'Round reached'
        }
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'Something went wrong',
        uiError: 'The game UI encountered an error. Try refreshing the page.',
        reloadPage: 'Reload Page',
        errorDetails: 'Error details',
        connectionFailed: 'Unable to connect to multiplayer server.',
        gameNotLoaded: 'Game not fully loaded.',
        createRoomFailed: 'Failed to create room.',
        joinRoomFailed: 'Failed to join room',
        noAvailableRooms: 'No available rooms',
        roomCodeLength: 'Room code must be 6 characters'
    },

    // Welcome / Identity
    identity: {
        welcome: 'Welcome to Sheep Dog Sim!',
        chooseIdentity: 'Choose how you\'d like to be known:',
        welcomeBack: 'Welcome back, {{name}}!',
        confirmSelection: 'Confirm Selection',
        nameUpdated: 'Name updated',
        continue: 'Continue →',
        settingUp: 'Setting up...',
        customName: 'Custom Name',
        customNameDesc: 'Choose your own display name',
        enterName: 'Enter your name...',
        randomName: 'Random Name',
        randomNameDesc: 'Get a randomly generated herding-themed name',
        anonymous: 'Stay Anonymous',
        anonymousDesc: 'Play as "Player" without a custom name',
        errorEmpty: 'Please enter a display name or choose another option',
        errorTooLong: 'Display name must be 20 characters or less',
        errorFailed: 'Failed to create player identity. Please try again.'
    }
};
