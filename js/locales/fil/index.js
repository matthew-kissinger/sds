/**
 * Filipino (Tagalog) Translations
 * Salin sa Filipino
 */

export default {
    // Common UI elements
    common: {
        back: 'Bumalik',
        backToMenu: '← Bumalik sa Menu',
        start: 'Simulan',
        cancel: 'Kanselahin',
        confirm: 'Kumpirmahin',
        save: 'I-save',
        close: 'Isara',
        loading: 'Naglo-load...',
        error: 'Error',
        retry: 'Subukan Muli',
        refresh: 'I-refresh',
        copy: 'Kopyahin',
        copied: 'Nakopya!',
        you: 'Ikaw',
        host: 'Host',
        waiting: 'Naghihintay...',
        players: 'Mga Manlalaro',
        player: 'Manlalaro'
    },

    // Main menu / Mode selection
    menu: {
        title: 'Sheepdog Simulator',
        soloPlay: 'Solo na Laro',
        soloPlayDesc: 'Mag-practice ng pag-aalaga sa sariling bilis',
        local2Player: 'Lokal na 2 Manlalaro',
        local2PlayerDesc: 'Magtulungan o magpaligsahan sa isang screen',
        sandbox: 'Sandbox',
        sandboxDesc: 'I-customize ang tupa, bakod at mga patakaran',
        multiplayer: 'Multiplayer',
        multiplayerDesc: 'Magtulungan o magpaligsahan online',
        leaderboard: 'Leaderboard',
        leaderboardDesc: 'Tingnan ang global rankings',
        settings: 'Mga Setting',
        settingsDesc: 'I-adjust ang game settings'
    },

    // Dog selection
    dogs: {
        title: 'Piliin ang Iyong Aso',
        stats: {
            speed: 'Bilis',
            stamina: 'Stamina',
            control: 'Kontrol'
        },
        jep: {
            name: 'Jep',
            breed: 'Border Collie',
            description: 'Balanseng tagapag-alaga na may magandang stamina'
        },
        pip: {
            name: 'Pip',
            breed: 'Australian Shepherd',
            description: 'Mabilis at maliksi, perpekto para sa mabilis na pag-aalaga'
        },
        sally: {
            name: 'Sally',
            breed: 'Welsh Corgi',
            description: 'Mahusay na kontrol pero mas mabagal kumilos'
        },
        shiloh: {
            name: 'Shiloh',
            breed: 'German Shepherd',
            description: 'Malakas at matatag na may mahusay na stamina'
        },
        georgeWashington: {
            name: 'George Washington',
            breed: 'American Foxhound',
            description: 'Taktikal na tagapag-alaga na may balanseng kakayahan'
        }
    },

    // Game modes
    modes: {
        title: 'Piliin ang Game Mode',
        classic: 'Classic Mode',
        classicDesc: 'Ipunin lahat ng 200 tupa sa pastulan',
        extreme: 'Extreme Mode',
        extremeDesc: 'Ipunin lahat ng 1000 tupa - performance challenge!'
    },

    // Settings panel
    settings: {
        title: 'Mga Setting',
        performanceMode: 'Performance Mode',
        performanceOption: 'Performance - Maximum FPS',
        balancedOption: 'Balansed - Default settings',
        qualityOption: 'Kalidad - Pinakamahusay na visuals',
        audioEnabled: 'Audio Naka-on',
        audioVolume: 'Audio Volume',
        showStats: 'Ipakita ang Performance Stats',
        resetDefaults: 'I-reset sa Defaults',
        language: 'Wika'
    },

    // Sandbox setup
    sandbox: {
        title: 'Sandbox Setup',
        sheepCount: 'Bilang ng Tupa',
        numberOfSheep: 'Bilang ng tupa',
        behavior: 'Ugali',
        movementSpeed: 'Bilis ng Kilos',
        flockCohesion: 'Pagkakaisa ng Kawan',
        separationDistance: 'Distansya ng Paghihiwalay',
        fieldSize: 'Laki ng Field',
        fieldShape: 'Hugis ng Field',
        fenceLayout: 'Layout ng Bakod',
        editFenceLayout: 'I-edit ang Layout ng Bakod',
        editCustomShape: 'I-edit ang Custom Shape',
        drawCustomShape: 'Gumuhit ng Custom Shape',
        timer: 'Timer',
        enableTimer: 'I-enable ang Timer',
        countUp: 'Pataas ang Bilang',
        countUpDesc: 'I-track ang iyong oras',
        countdown: 'Countdown',
        countdownDesc: 'Karera laban sa oras',
        timeLimit: 'Time Limit',
        winCondition: 'Kondisyon sa Pagkapanalo',
        herdAllSheep: 'Ipunin Lahat ng Tupa',
        herdAllSheepDesc: 'Classic na pagtatapos - lahat ng tupa sa pastulan',
        percentageGoal: 'Percentage Goal',
        percentageGoalDesc: 'Matapos kapag naabot ang target percentage',
        targetPercentage: 'Target Percentage',
        freePlay: 'Libreng Laro',
        freePlayDesc: 'Walang kondisyon - maglaro lang!',
        startGame: 'Simulan ang Laro',
        startGameWithCount: 'Simulan ang Laro ({{count}} tupa)',
        tabs: {
            sheep: 'Tupa',
            field: 'Field',
            rules: 'Mga Patakaran'
        },
        sizes: {
            small: 'Maliit',
            medium: 'Katamtaman',
            large: 'Malaki',
            huge: 'Napakalaki'
        },
        shapes: {
            square: 'Parisukat',
            wide: 'Malapad',
            tall: 'Matangkad',
            lShape: 'L-Shape',
            circle: 'Bilog',
            diamond: 'Diamante',
            triangle: 'Tatsulok',
            custom: 'Custom'
        },
        fencePresets: {
            open: 'Bukas na Field',
            openDesc: 'Walang panloob na bakod',
            corridor: 'Koridor',
            corridorDesc: 'Nababakuran na daan patungo sa gate',
            funnel: 'Funnel',
            funnelDesc: 'Pumapaliit na daan patungo sa gate',
            maze: 'Maze',
            mazeDesc: 'Mga hadlang na dapat lampasan',
            obstacles: 'Mga Hadlang',
            obstaclesDesc: 'Random na mga hadlang',
            custom: 'Custom',
            customDesc: 'I-disenyo ang sariling layout'
        }
    },

    // Local 2-player mode
    localMode: {
        title: 'Lokal na 2 Manlalaro',
        coop: 'Co-op',
        coopDesc: 'Magtulungan para ipunin ang 200 tupa',
        versus: '1v1 Race',
        versusDesc: 'Unang maka-100 tupa ang panalo!',
        timed: 'May Oras',
        timedDesc: '3 minuto - nagre-respawn ang tupa!',
        player: 'Manlalaro',
        controls1: 'WASD + Kaliwang Shift',
        controls2: 'Arrow + Kanang Shift',
        startGame: 'Simulan ang Laro',
        noLeaderboards: 'Hindi isinusumite sa leaderboard ang mga score sa local mode'
    },

    // Fence editor
    fenceEditor: {
        title: 'Layout ng Bakod',
        fenceCount: '{{count}} bakod',
        fenceCountPlural: '{{count}} bakod',
        quickLayouts: 'Mabilis na Layouts',
        tools: 'Mga Tool',
        draw: 'Gumuhit',
        select: 'Pumili',
        erase: 'Burahin',
        pan: 'I-pan',
        clearAll: 'Burahin Lahat',
        done: 'Tapos',
        dogLabel: 'ASO',
        sheepSpawn: 'Spawn Point ng Tupa',
        helpDraw: 'I-click at i-drag para gumuhit ng bakod - Grid 10m',
        helpErase: 'I-click ang bakod para burahin',
        helpPan: 'I-drag para mag-pan - Mag-scroll para mag-zoom',
        helpSelect: 'I-click ang bakod para piliin',
        presets: {
            open: 'Walang laman na field',
            corridor: 'Gabay na daan',
            funnel: 'Pumapaliit',
            maze: 'Lampasan ang hadlang',
            obstacles: 'Random na blocks'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'Multiplayer',
        createRoom: 'Gumawa ng Room',
        createRoomDesc: 'Mag-host ng bagong game room',
        joinRoom: 'Sumali sa Room',
        joinRoomDesc: 'Ilagay ang room code',
        quickMatch: 'Quick Match',
        quickMatchDesc: 'Maghanap ng available na laro',
        maxPlayers: 'Max na Manlalaro',
        playersCount: '{{count}} Manlalaro',
        gameMode: 'Game Mode',
        cooperative: 'Cooperative',
        cooperativeDesc: 'Magtulungan para ipunin lahat ng tupa sa kulungan',
        competitive: 'Competitive',
        competitiveDesc: 'Magpaligsahan kung sino ang makakakolekta ng mas maraming tupa',
        timed: 'May Oras (3 min)',
        timedDesc: 'Mag-score ng marami sa loob ng 3 minuto',
        roomCode: 'Room Code',
        enterRoomCode: 'Ilagay ang room code',
        leaveRoom: 'Umalis sa Room',
        startGame: 'Simulan ang Laro',
        waitingForPlayers: 'Naghihintay ng mga manlalaro...'
    },

    // Lobby
    lobby: {
        title: 'Game Lobby',
        roomCode: 'Room Code',
        playersCount: 'Mga Manlalaro ({{current}}/{{max}})',
        waitingForMore: 'Naghihintay ng iba pang manlalaro...'
    },

    // Leaderboard
    leaderboard: {
        title: 'Global Leaderboard',
        soloClassic: 'Solo Classic',
        soloExtreme: 'Solo Extreme',
        timed: 'May Oras (3 min)',
        competitive: 'Competitive',
        cooperative: 'Cooperative',
        updated: 'Na-update {{time}}',
        loading: 'Nilo-load ang leaderboard...',
        noScores: 'Wala pang naitatalang score. Maging una!',
        serverOffline: 'Offline ang server - Hindi available ang leaderboard. Maaaring nagsisimula o pansamantalang down ang server.',
        loadFailed: 'Hindi na-load ang leaderboard. Subukan ulit.',
        ranks: {
            first: 'Ika-1',
            second: 'Ika-2',
            third: 'Ika-3'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'Tupa',
        stamina: 'Stamina',
        time: 'Oras',
        score: 'Score',
        timeRemaining: 'Natitirang Oras',
        complete: 'tapos'
    },

    // Pause menu
    pause: {
        title: 'NAKA-PAUSE',
        tapToResume: 'Mag-tap sa labas para magpatuloy',
        pressEscToResume: 'Pindutin ang ESC para magpatuloy',
        resume: 'Magpatuloy',
        restart: 'Magsimula Muli',
        mainMenu: 'Main Menu',
        fullscreen: 'Fullscreen',
        exitFullscreen: 'Lumabas sa Fullscreen'
    },

    // Completion screen
    completion: {
        victory: 'Panalo!',
        allSheepHerded: 'Matagumpay na naipunin ang lahat ng {{count}} tupa!',
        raceComplete: 'Tapos ang Race',
        youWon: 'Nanalo ka!',
        playerWon: 'Nanalo si {{name}}!',
        timesUp: 'Ubos na ang Oras',
        timesUpVictory: 'Ubos na ang Oras - Panalo!',
        youCollectedMost: 'Ikaw ang nakakolekta ng pinakamaraming tupa!',
        playerCollectedMost: 'Si {{name}} ang nakakolekta ng pinakamarami!',
        teamVictory: 'Panalo ang Team!',
        teamMessage: 'Sa pagtutulungan, naipunin ninyo ang lahat ng tupa!',
        gameComplete: 'Tapos ang Laro',
        wellPlayed: 'Mahusay na laro!',
        newPersonalBest: 'BAGONG PERSONAL BEST!',
        finalStandings: 'Final Standings',
        playAgain: 'Maglaro Ulit',
        nextChallenge: 'Susunod na Challenge',
        stats: {
            time: 'Oras',
            yourScore: 'Iyong Score',
            raceTime: 'Race Time',
            duration: 'Tagal',
            sheepCollected: 'Nakolektang Tupa',
            teamTime: 'Team Time'
        },
        sheepUnit: '{{count}} tupa'
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'May nangyaring mali',
        uiError: 'Nagkaroon ng error ang game UI. Subukang i-refresh ang page.',
        reloadPage: 'I-reload ang Page',
        errorDetails: 'Mga detalye ng error',
        connectionFailed: 'Hindi makakonekta sa multiplayer server.',
        gameNotLoaded: 'Hindi pa ganap na na-load ang laro.',
        createRoomFailed: 'Hindi nagawa ang room.',
        joinRoomFailed: 'Hindi nakasali sa room',
        noAvailableRooms: 'Walang available na room',
        roomCodeLength: 'Ang room code ay dapat 6 na character'
    },

    // Welcome / Identity
    identity: {
        welcome: 'Maligayang pagdating sa Sheepdog Simulator!',
        chooseIdentity: 'Piliin kung paano mo gustong makilala:',
        welcomeBack: 'Maligayang pagbabalik, {{name}}!',
        confirmSelection: 'Kumpirmahin ang Pagpili',
        continue: 'Magpatuloy →',
        settingUp: 'Nag-aayos...',
        customName: 'Custom na Pangalan',
        customNameDesc: 'Pumili ng sariling display name',
        enterName: 'Ilagay ang iyong pangalan...',
        randomName: 'Random na Pangalan',
        randomNameDesc: 'Kumuha ng random na pangalan na may temang pag-aalaga',
        anonymous: 'Manatiling Anonymous',
        anonymousDesc: 'Maglaro bilang "Manlalaro" nang walang custom na pangalan',
        errorEmpty: 'Mangyaring maglagay ng display name o pumili ng ibang opsyon',
        errorTooLong: 'Ang display name ay dapat 20 character o mas maikli',
        errorFailed: 'Nabigo ang paglikha ng player identity. Subukan ulit.'
    }
};
