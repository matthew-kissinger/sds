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
        hint: 'WASD to move · Shift to sprint · ↑/↓ to zoom'
    },

    // First-run tutorial (P1-TUTORIAL): offer card + in-run prompts.
    tutorial: {
        skip: 'Skip tutorial',
        herdProgress: '{{penned}} of {{goal}} penned',
        step: {
            move: 'Move your dog with WASD.',
            moveTouch: 'Drag the joystick to move your dog.',
            sprint: 'Hold Shift to sprint. Sprinting drains stamina.',
            sprintTouch: 'Hold the sprint button for a burst of speed. It drains stamina.',
            camera: 'Press C to change the camera view. Use ↑/↓ to zoom.',
            cameraTouch: 'Tap the camera chip at the top to change the view.',
            bark: 'Press your bark key when the flock is ahead. Watch the sound wave and cooldown.',
            barkTouch: 'Tap the bark button when the flock is ahead. Watch the sound wave and cooldown.',
            herd: 'Herd 3 sheep through the gate into the pen. Stay behind the flock; sheep run from you.',
            done: 'Three penned. You know the job now. The rest of the flock is yours.'
        }
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

    // P1-MOBILE-FALLBACK: one-per-session toast when the boot lands on WebGL
    // because WebGPU was unavailable (never for an explicit ?renderer=webgl).
    rendererFallback: {
        title: 'Compatibility rendering',
        body: 'Running the WebGL renderer on this browser. The game plays the same; some visual detail is reduced.'
    },

    // P4-CTX-RESTORE: overlay shown when the graphics context is lost,
    // just before the automatic reload.
    contextLost: {
        title: 'Graphics context lost',
        body: 'Restarting the renderer. The game will reload in a moment.'
    },

    // P4-SW-TOAST: persistent toast when a new service worker takes control
    // mid-session (a fresh deploy landed). Button label rides common.refresh.
    swUpdate: {
        ready: 'A new version is ready.'
    },

    // Settings panel
    settings: {
        title: 'Settings',
        // Tabs
        tabs: {
            graphics: 'Graphics',
            audio: 'Audio',
            controls: 'Controls',
            general: 'General'
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
        rendererDiagnostics: 'Renderer status',
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
            bark: 'Bark',
            cameraCycle: 'Cycle Camera',
            pause: 'Pause',
            zoomIn: 'Zoom In',
            zoomOut: 'Zoom Out',
            bank: 'Bank Score',
            note: 'Open Note',
            moveX: 'Move (horizontal)',
            moveY: 'Move (vertical)'
        },
        cameraModeSection: 'Camera mode (press {{key}} to cycle)',
        cameraModes: {
            follow: 'Follow',
            followDesc: 'Cinematic close-up behind the dog (default)',
            free: 'Free',
            freeDesc: 'Right-mouse-drag to orbit the dog',
            classic: 'Classic',
            classicDesc: 'High isometric overhead view'
        },
        gamepadSupport: 'Gamepad Support',
        gamepadDesc: 'Controllers are automatically detected. Use left stick to move, A/B to zoom, and triggers to sprint.',
        // Gamepad config ([P4-GAMEPAD-UI])
        gamepadDeadzone: 'Stick deadzone',
        gamepadDeadzoneDesc: 'Stick input below this is ignored',
        stickPreview: 'Stick input (after deadzone)',
        gamepadButtons: 'Gamepad Buttons',
        gamepadAxes: 'Movement Stick Axes',
        pressButton: 'Press a button...',
        moveAxis: 'Move a stick...',
        axisLabel: 'Axis {{index}}',
        padConflict: 'Button already used for {{action}}',
        axisConflict: 'Axis already used for {{action}}',
        // General
        resetDefaults: 'Reset All',
        language: 'Language',
        accessibility: 'Accessibility',
        colorblindMode: 'Colorblind-friendly colors',
        colorblindModeDesc: 'Use a colorblind-safe palette for medal and rank colors',
        tutorialLabel: 'Tutorial',
        tutorialDesc: 'Run the guided herding lesson again',
        replayTutorial: 'Replay tutorial',
        profile: 'Player Profile',
        resetProfile: 'Reset profile',
        resetProfileDesc: 'Clears the local player identity. A new one is created on reload; stats and key bindings stay.',
        resetProfileConfirm: 'Reset your player profile? A new shepherd identity is created when the game reloads.',
        aboutLink: 'About this game'
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
        // P1-MOBILE-WARN: shown to a mobile host picking Insane/Chaos. The
        // server admits only desktop clients to rooms over 1000 sheep, so the
        // host's own device cannot join the room it creates.
        mobileHostHighSheep: 'This device is mobile. Rooms over 1,000 sheep admit desktop players only, so you will not be able to join the room you create.',
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
        waitingForMore: 'Waiting for more players...',
        // [P1-SHARE] copy-invite-link affordance.
        copyInviteLink: 'Copy invite link',
        inviteLinkCopied: 'Link copied'
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
        // [P1-SHARE] completion share button + Web Share / clipboard payload.
        // Concrete numbers, no hype, per the prose-and-voice rule.
        share: {
            button: 'Share',
            copied: 'Copied',
            title: 'Sheep Dog Sim',
            single: 'Herded {{count}} sheep into the pen in {{time}} on Sheep Dog Sim.',
            counting: 'Counted {{count}} sheep and reached round {{round}} on Sheep Dog Sim.',
            mpWin: 'Won a multiplayer round with {{count}} sheep on Sheep Dog Sim.',
            mpScore: 'Penned {{count}} sheep in a multiplayer round on Sheep Dog Sim.',
            cooperative: 'Herded {{count}} sheep with the team on Sheep Dog Sim.',
            generic: 'Finished a round of Sheep Dog Sim.'
        },
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
    },

    // [P3-ACHIEVE-DATA] Achievement names + descriptions. Ids live in
    // js/achievements/definitions.js and map here via nameKey/descKey.
    achievements: {
        // [P3-ACHIEVE-UI] UI chrome: the unlock toast + the menu list view.
        ui: {
            toastTitle: 'Achievement unlocked',
            panelTitle: 'Achievements',
            summary: '{{unlocked}} of {{total}} unlocked',
            locked: 'Locked',
            unlockedOn: 'Unlocked {{date}}'
        },
        firstPen: {
            name: 'First Pen',
            desc: 'Pen your first full flock.'
        },
        pen200HomeField: {
            name: 'Home Field Classic',
            desc: 'Pen all 200 sheep in Solo Classic on Home Field.'
        },
        pen200RollingHills: {
            name: 'Rolling Hills Classic',
            desc: 'Pen the 75-sheep Classic flock on Rolling Hills.'
        },
        pen200OpenCountry: {
            name: 'Open Country Classic',
            desc: 'Pen the 50-sheep Classic flock on Open Country.'
        },
        chaos5000: {
            name: 'Chaos Shepherd',
            desc: 'Pen 5,000 sheep in Solo Chaos.'
        },
        allFiveDogs: {
            name: 'Full Kennel',
            desc: 'Complete a solo round with each of the five dogs.'
        },
        surviveFirstNight: {
            name: 'First Night',
            desc: 'Survive your first night on Newsheepdogland.'
        },
        survive5Nights: {
            name: 'Five Nights',
            desc: 'Survive 5 nights in a single run on Newsheepdogland.'
        },
        winCompetitiveRoom: {
            name: 'Top Dog',
            desc: 'Win a competitive multiplayer room.'
        }
    }
};
