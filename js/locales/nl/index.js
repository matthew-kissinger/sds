/**
 * Dutch Translations
 * Nederlandse vertaling
 */

export default {
    // Common UI elements
    common: {
        back: 'Terug',
        backToMenu: '← Terug naar menu',
        start: 'Start',
        cancel: 'Annuleren',
        confirm: 'Bevestigen',
        save: 'Opslaan',
        close: 'Sluiten',
        loading: 'Laden...',
        error: 'Fout',
        retry: 'Opnieuw proberen',
        refresh: 'Vernieuwen',
        copy: 'Kopiëren',
        copied: 'Gekopieerd!',
        you: 'Jij',
        host: 'Host',
        waiting: 'Wachten...',
        players: 'Spelers',
        player: 'Speler'
    },

    // Main menu / Mode selection
    menu: {
        title: 'Herdershond Simulator',
        soloPlay: 'Solo Spelen',
        soloPlayDesc: 'Oefen hoeden in je eigen tempo',
        local2Player: 'Lokaal 2 Spelers',
        local2PlayerDesc: 'Samenwerken of strijden op één scherm',
        sandbox: 'Sandbox',
        sandboxDesc: 'Pas schapen, hekken en regels aan',
        multiplayer: 'Multiplayer',
        multiplayerDesc: 'Werk samen of strijd online',
        leaderboard: 'Ranglijst',
        leaderboardDesc: 'Bekijk wereldwijde ranglijsten',
        settings: 'Instellingen',
        settingsDesc: 'Pas spelinstellingen aan'
    },

    // Dog selection
    dogs: {
        title: 'Kies je hond',
        stats: {
            speed: 'Snelheid',
            stamina: 'Uithoudingsvermogen',
            control: 'Controle'
        },
        jep: {
            name: 'Jep',
            breed: 'Border Collie',
            description: 'Evenwichtige herder met goed uithoudingsvermogen'
        },
        pip: {
            name: 'Pip',
            breed: 'Australische Herder',
            description: 'Snel en behendig, perfect voor snel hoeden'
        },
        sally: {
            name: 'Sally',
            breed: 'Welsh Corgi',
            description: 'Geweldige controle maar langzamere beweging'
        },
        shiloh: {
            name: 'Shiloh',
            breed: 'Duitse Herder',
            description: 'Sterk en stabiel met uitstekend uithoudingsvermogen'
        },
        georgeWashington: {
            name: 'George Washington',
            breed: 'American Foxhound',
            description: 'Tactische herder met evenwichtige vaardigheden'
        }
    },

    // Game modes
    modes: {
        title: 'Kies spelmodus',
        classic: 'Klassieke Modus',
        classicDesc: 'Hoed alle 200 schapen naar de wei',
        extreme: 'Extreme Modus',
        extremeDesc: 'Hoed alle 1000 schapen - prestatie-uitdaging!'
    },

    // Settings panel
    settings: {
        title: 'Instellingen',
        performanceMode: 'Prestatiemodus',
        performanceOption: 'Prestatie - Maximale FPS',
        balancedOption: 'Gebalanceerd - Standaardinstellingen',
        qualityOption: 'Kwaliteit - Beste graphics',
        audioEnabled: 'Geluid Aan',
        audioVolume: 'Geluidsvolume',
        showStats: 'Toon prestatiestatistieken',
        resetDefaults: 'Herstel standaardwaarden',
        language: 'Taal'
    },

    // Sandbox setup
    sandbox: {
        title: 'Sandbox Instellingen',
        sheepCount: 'Aantal Schapen',
        numberOfSheep: 'Aantal schapen',
        behavior: 'Gedrag',
        movementSpeed: 'Bewegingssnelheid',
        flockCohesion: 'Kudde Samenhang',
        separationDistance: 'Scheidingsafstand',
        fieldSize: 'Veldgrootte',
        fieldShape: 'Veldvorm',
        fenceLayout: 'Hekindeling',
        editFenceLayout: 'Bewerk hekindeling',
        editCustomShape: 'Bewerk aangepaste vorm',
        drawCustomShape: 'Teken aangepaste vorm',
        timer: 'Timer',
        enableTimer: 'Timer inschakelen',
        countUp: 'Optellen',
        countUpDesc: 'Houd je tijd bij',
        countdown: 'Aftellen',
        countdownDesc: 'Race tegen de klok',
        timeLimit: 'Tijdslimiet',
        winCondition: 'Winstvoorwaarde',
        herdAllSheep: 'Hoed Alle Schapen',
        herdAllSheepDesc: 'Klassieke voltooiing - alle schapen naar de wei',
        percentageGoal: 'Percentage Doel',
        percentageGoalDesc: 'Voltooi bij het bereiken van doelpercentage',
        targetPercentage: 'Doelpercentage',
        freePlay: 'Vrij Spelen',
        freePlayDesc: 'Geen winstvoorwaarde - gewoon spelen!',
        startGame: 'Start Spel',
        startGameWithCount: 'Start Spel ({{count}} schapen)',
        tabs: {
            sheep: 'Schapen',
            field: 'Veld',
            rules: 'Regels'
        },
        sizes: {
            small: 'Klein',
            medium: 'Middel',
            large: 'Groot',
            huge: 'Enorm'
        },
        shapes: {
            square: 'Vierkant',
            wide: 'Breed',
            tall: 'Hoog',
            lShape: 'L-vorm',
            circle: 'Cirkel',
            diamond: 'Ruit',
            triangle: 'Driehoek',
            custom: 'Aangepast'
        },
        fencePresets: {
            open: 'Open Veld',
            openDesc: 'Geen interne hekken',
            corridor: 'Gang',
            corridorDesc: 'Omheind pad naar poort',
            funnel: 'Trechter',
            funnelDesc: 'Versmallend pad naar poort',
            maze: 'Doolhof',
            mazeDesc: 'Obstakels om te navigeren',
            obstacles: 'Obstakels',
            obstaclesDesc: 'Willekeurige hekobstakels',
            custom: 'Aangepast',
            customDesc: 'Ontwerp je eigen indeling'
        }
    },

    // Local 2-player mode
    localMode: {
        title: 'Lokaal 2 Spelers',
        coop: 'Co-op',
        coopDesc: 'Werk samen om 200 schapen te hoeden',
        versus: '1v1 Race',
        versusDesc: 'Eerste naar 100 schapen wint!',
        timed: 'Getimed',
        timedDesc: '3 minuten - schapen respawnen!',
        player: 'Speler',
        controls1: 'WASD + L.Shift',
        controls2: 'Pijltjes + R.Shift',
        startGame: 'Start Spel',
        noLeaderboards: 'Scores in lokale modus worden niet naar de ranglijst verzonden'
    },

    // Fence editor
    fenceEditor: {
        title: 'Hekindeling',
        fenceCount: '{{count}} hek',
        fenceCountPlural: '{{count}} hekken',
        quickLayouts: 'Snelle Indelingen',
        tools: 'Gereedschap',
        draw: 'Tekenen',
        select: 'Selecteren',
        erase: 'Wissen',
        pan: 'Verschuiven',
        clearAll: 'Alles Wissen',
        done: 'Klaar',
        dogLabel: 'HOND',
        sheepSpawn: 'Schaap Spawnpunt',
        helpDraw: 'Klik en sleep om hekken te tekenen - Raster 10m',
        helpErase: 'Klik op een hek om te verwijderen',
        helpPan: 'Sleep om te verschuiven - Scroll om te zoomen',
        helpSelect: 'Klik op een hek om te selecteren',
        presets: {
            open: 'Leeg veld',
            corridor: 'Geleid pad',
            funnel: 'Versmalling',
            maze: 'Navigeer obstakels',
            obstacles: 'Willekeurige blokken'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'Multiplayer',
        createRoom: 'Maak Kamer',
        createRoomDesc: 'Host een nieuwe spelkamer',
        joinRoom: 'Deelnemen',
        joinRoomDesc: 'Voer kamercode in',
        quickMatch: 'Snel Spel',
        quickMatchDesc: 'Vind een beschikbaar spel',
        maxPlayers: 'Max Spelers',
        playersCount: '{{count}} Spelers',
        gameMode: 'Spelmodus',
        cooperative: 'Coöperatief',
        cooperativeDesc: 'Werk samen om alle schapen in de kooi te hoeden',
        competitive: 'Competitief',
        competitiveDesc: 'Race om de meeste schapen te verzamelen',
        timed: 'Getimed (3 min)',
        timedDesc: 'Scoor zoveel mogelijk punten in 3 minuten',
        roomCode: 'Kamercode',
        enterRoomCode: 'Voer kamercode in',
        leaveRoom: 'Verlaat Kamer',
        startGame: 'Start Spel',
        waitingForPlayers: 'Wachten op spelers...'
    },

    // Lobby
    lobby: {
        title: 'Spellobby',
        roomCode: 'Kamercode',
        playersCount: 'Spelers ({{current}}/{{max}})',
        waitingForMore: 'Wachten op meer spelers...'
    },

    // Leaderboard
    leaderboard: {
        title: 'Wereldwijde Ranglijst',
        soloClassic: 'Solo Klassiek',
        soloExtreme: 'Solo Extreem',
        timed: 'Getimed (3 min)',
        competitive: 'Competitief',
        cooperative: 'Coöperatief',
        updated: 'Bijgewerkt {{time}}',
        loading: 'Ranglijst laden...',
        noScores: 'Nog geen scores geregistreerd. Wees de eerste!',
        serverOffline: 'Server offline - Ranglijst niet beschikbaar. De server wordt mogelijk opgestart of is tijdelijk niet beschikbaar.',
        loadFailed: 'Kon ranglijst niet laden. Probeer opnieuw.',
        ranks: {
            first: '1e',
            second: '2e',
            third: '3e'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'Schapen',
        stamina: 'Uithoudingsvermogen',
        time: 'Tijd',
        score: 'Score',
        timeRemaining: 'Resterende Tijd',
        complete: 'voltooid'
    },

    // Pause menu
    pause: {
        title: 'GEPAUZEERD',
        tapToResume: 'Tik buiten om te hervatten',
        pressEscToResume: 'Druk ESC om te hervatten',
        resume: 'Hervatten',
        restart: 'Herstarten',
        mainMenu: 'Hoofdmenu',
        fullscreen: 'Volledig Scherm',
        exitFullscreen: 'Verlaat Volledig Scherm'
    },

    // Completion screen
    completion: {
        victory: 'Overwinning!',
        allSheepHerded: 'Alle {{count}} schapen succesvol gehoeid!',
        raceComplete: 'Race Voltooid',
        youWon: 'Je hebt gewonnen!',
        playerWon: '{{name}} heeft gewonnen!',
        timesUp: 'Tijd Om',
        timesUpVictory: 'Tijd Om - Overwinning!',
        youCollectedMost: 'Jij verzamelde de meeste schapen!',
        playerCollectedMost: '{{name}} verzamelde de meeste!',
        teamVictory: 'Team Overwinning!',
        teamMessage: 'Door samen te werken hebben jullie alle schapen gehoeid!',
        gameComplete: 'Spel Voltooid',
        wellPlayed: 'Goed gespeeld!',
        newPersonalBest: 'NIEUW PERSOONLIJK RECORD!',
        finalStandings: 'Eindstand',
        playAgain: 'Opnieuw Spelen',
        nextChallenge: 'Volgende Uitdaging',
        stats: {
            time: 'Tijd',
            yourScore: 'Jouw Score',
            raceTime: 'Racetijd',
            duration: 'Duur',
            sheepCollected: 'Schapen Verzameld',
            teamTime: 'Teamtijd'
        },
        sheepUnit: '{{count}} schapen'
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'Er ging iets mis',
        uiError: 'De game-interface ondervond een fout. Probeer de pagina te vernieuwen.',
        reloadPage: 'Pagina Herladen',
        errorDetails: 'Foutdetails',
        connectionFailed: 'Kan geen verbinding maken met multiplayer server.',
        gameNotLoaded: 'Spel niet volledig geladen.',
        createRoomFailed: 'Kon kamer niet maken.',
        joinRoomFailed: 'Kon niet deelnemen aan kamer',
        noAvailableRooms: 'Geen beschikbare kamers',
        roomCodeLength: 'Kamercode moet 6 tekens zijn'
    },

    // Welcome / Identity
    identity: {
        welcome: 'Welkom bij Herdershond Simulator!',
        chooseIdentity: 'Kies hoe je bekend wilt staan:',
        welcomeBack: 'Welkom terug, {{name}}!',
        confirmSelection: 'Bevestig Keuze',
        continue: 'Doorgaan →',
        settingUp: 'Instellen...',
        customName: 'Aangepaste Naam',
        customNameDesc: 'Kies je eigen weergavenaam',
        enterName: 'Voer je naam in...',
        randomName: 'Willekeurige Naam',
        randomNameDesc: 'Krijg een willekeurig gegenereerde hoedersthema naam',
        anonymous: 'Anoniem Blijven',
        anonymousDesc: 'Speel als "Speler" zonder aangepaste naam',
        errorEmpty: 'Voer een weergavenaam in of kies een andere optie',
        errorTooLong: 'Weergavenaam moet 20 tekens of minder zijn',
        errorFailed: 'Kan speleridentiteit niet maken. Probeer opnieuw.'
    }
};
