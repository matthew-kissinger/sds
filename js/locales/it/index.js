/**
 * Italian Translations
 * Traduzioni in italiano
 */

export default {
    // Common UI elements
    common: {
        back: 'Indietro',
        backToMenu: '← Torna al menu',
        start: 'Inizia',
        cancel: 'Annulla',
        confirm: 'Conferma',
        save: 'Salva',
        close: 'Chiudi',
        loading: 'Caricamento...',
        error: 'Errore',
        retry: 'Riprova',
        refresh: 'Aggiorna',
        copy: 'Copia',
        copied: 'Copiato!',
        you: 'Tu',
        host: 'Host',
        waiting: 'In attesa...',
        players: 'Giocatori',
        player: 'Giocatore'
    },

    // Main menu / Mode selection
    menu: {
        title: 'Simulatore Cane Pastore',
        soloPlay: 'Gioca Solo',
        soloPlayDesc: 'Esercitati a radunare al tuo ritmo',
        local2Player: '2 Giocatori Locale',
        local2PlayerDesc: 'Coopera o competi su uno schermo',
        sandbox: 'Sandbox',
        sandboxDesc: 'Personalizza pecore, recinti e regole',
        multiplayer: 'Multiplayer',
        multiplayerDesc: 'Coopera o competi online',
        leaderboard: 'Classifica',
        leaderboardDesc: 'Visualizza le classifiche globali',
        settings: 'Impostazioni',
        settingsDesc: 'Regola le impostazioni di gioco'
    },

    // Dog selection
    dogs: {
        title: 'Scegli il tuo cane',
        stats: {
            speed: 'Velocità',
            stamina: 'Resistenza',
            control: 'Controllo'
        },
        jep: {
            name: 'Jep',
            breed: 'Border Collie',
            description: 'Pastore equilibrato con buona resistenza'
        },
        pip: {
            name: 'Pip',
            breed: 'Pastore Australiano',
            description: 'Veloce e agile, perfetto per radunare rapidamente'
        },
        sally: {
            name: 'Sally',
            breed: 'Welsh Corgi',
            description: 'Ottimo controllo ma movimento più lento'
        },
        shiloh: {
            name: 'Shiloh',
            breed: 'Pastore Tedesco',
            description: 'Forte e stabile con eccellente resistenza'
        },
        georgeWashington: {
            name: 'George Washington',
            breed: 'American Foxhound',
            description: 'Pastore tattico con abilità equilibrate'
        }
    },

    // Game modes
    modes: {
        title: 'Scegli la modalità',
        classic: 'Modalità Classica',
        classicDesc: 'Raduna tutte le 200 pecore nel pascolo',
        extreme: 'Modalità Estrema',
        extremeDesc: 'Raduna tutte le 1000 pecore - sfida prestazionale!'
    },

    // Settings panel
    settings: {
        title: 'Impostazioni',
        performanceMode: 'Modalità Prestazioni',
        performanceOption: 'Prestazioni - FPS Massimi',
        balancedOption: 'Bilanciato - Impostazioni predefinite',
        qualityOption: 'Qualità - Migliore grafica',
        audioEnabled: 'Audio Attivo',
        audioVolume: 'Volume Audio',
        showStats: 'Mostra Statistiche',
        resetDefaults: 'Ripristina Predefiniti',
        language: 'Lingua'
    },

    // Sandbox setup
    sandbox: {
        title: 'Configurazione Sandbox',
        sheepCount: 'Numero Pecore',
        numberOfSheep: 'Numero di pecore',
        behavior: 'Comportamento',
        movementSpeed: 'Velocità Movimento',
        flockCohesion: 'Coesione Gregge',
        separationDistance: 'Distanza Separazione',
        fieldSize: 'Dimensione Campo',
        fieldShape: 'Forma Campo',
        fenceLayout: 'Disposizione Recinti',
        editFenceLayout: 'Modifica Recinti',
        editCustomShape: 'Modifica Forma Personalizzata',
        drawCustomShape: 'Disegna Forma Personalizzata',
        timer: 'Timer',
        enableTimer: 'Attiva Timer',
        countUp: 'Conteggio',
        countUpDesc: 'Traccia il tuo tempo',
        countdown: 'Conto alla Rovescia',
        countdownDesc: 'Corsa contro il tempo',
        timeLimit: 'Limite di Tempo',
        winCondition: 'Condizione di Vittoria',
        herdAllSheep: 'Raduna Tutte le Pecore',
        herdAllSheepDesc: 'Completamento classico - tutte le pecore al pascolo',
        percentageGoal: 'Obiettivo Percentuale',
        percentageGoalDesc: 'Completa raggiungendo la percentuale target',
        targetPercentage: 'Percentuale Target',
        freePlay: 'Gioco Libero',
        freePlayDesc: 'Nessuna condizione - gioca liberamente!',
        startGame: 'Inizia Partita',
        startGameWithCount: 'Inizia Partita ({{count}} pecore)',
        tabs: {
            sheep: 'Pecore',
            field: 'Campo',
            rules: 'Regole'
        },
        sizes: {
            small: 'Piccolo',
            medium: 'Medio',
            large: 'Grande',
            huge: 'Enorme'
        },
        shapes: {
            square: 'Quadrato',
            wide: 'Largo',
            tall: 'Alto',
            lShape: 'Forma a L',
            circle: 'Cerchio',
            diamond: 'Diamante',
            triangle: 'Triangolo',
            custom: 'Personalizzato'
        },
        fencePresets: {
            open: 'Campo Aperto',
            openDesc: 'Nessun recinto interno',
            corridor: 'Corridoio',
            corridorDesc: 'Percorso recintato verso il cancello',
            funnel: 'Imbuto',
            funnelDesc: 'Percorso che si restringe',
            maze: 'Labirinto',
            mazeDesc: 'Ostacoli da navigare',
            obstacles: 'Ostacoli',
            obstaclesDesc: 'Ostacoli casuali',
            custom: 'Personalizzato',
            customDesc: 'Progetta la tua disposizione'
        }
    },

    // Local 2-player mode
    localMode: {
        title: '2 Giocatori Locale',
        coop: 'Cooperativa',
        coopDesc: 'Lavorate insieme per radunare 200 pecore',
        versus: 'Gara 1v1',
        versusDesc: 'Il primo a 100 pecore vince!',
        timed: 'A Tempo',
        timedDesc: '3 minuti - le pecore rinascono!',
        player: 'Giocatore',
        controls1: 'WASD + Shift Sin.',
        controls2: 'Frecce + Shift Des.',
        startGame: 'Inizia Partita',
        noLeaderboards: 'I punteggi in modalità locale non vengono inviati alle classifiche'
    },

    // Fence editor
    fenceEditor: {
        title: 'Disposizione Recinti',
        fenceCount: '{{count}} recinto',
        fenceCountPlural: '{{count}} recinti',
        quickLayouts: 'Layout Rapidi',
        tools: 'Strumenti',
        draw: 'Disegna',
        select: 'Seleziona',
        erase: 'Cancella',
        pan: 'Sposta',
        clearAll: 'Cancella Tutto',
        done: 'Fatto',
        dogLabel: 'CANE',
        sheepSpawn: 'Punto Spawn Pecore',
        helpDraw: 'Clicca e trascina per disegnare recinti - Griglia 10m',
        helpErase: 'Clicca su un recinto per eliminarlo',
        helpPan: 'Trascina per spostare - Scorri per zoom',
        helpSelect: 'Clicca su un recinto per selezionarlo',
        presets: {
            open: 'Campo libero',
            corridor: 'Percorso guidato',
            funnel: 'Restringimento',
            maze: 'Naviga ostacoli',
            obstacles: 'Blocchi casuali'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'Multiplayer',
        createRoom: 'Crea Stanza',
        createRoomDesc: 'Ospita una nuova partita',
        joinRoom: 'Unisciti',
        joinRoomDesc: 'Inserisci codice stanza',
        quickMatch: 'Partita Rapida',
        quickMatchDesc: 'Trova una partita disponibile',
        maxPlayers: 'Max Giocatori',
        playersCount: '{{count}} Giocatori',
        gameMode: 'Modalità di Gioco',
        cooperative: 'Cooperativa',
        cooperativeDesc: 'Lavorate insieme per radunare tutte le pecore',
        competitive: 'Competitiva',
        competitiveDesc: 'Corsa per raccogliere più pecore degli avversari',
        timed: 'A Tempo (3 min)',
        timedDesc: 'Fai più punti possibili in 3 minuti',
        roomCode: 'Codice Stanza',
        enterRoomCode: 'Inserisci codice stanza',
        leaveRoom: 'Esci dalla Stanza',
        startGame: 'Inizia Partita',
        waitingForPlayers: 'In attesa di giocatori...'
    },

    // Lobby
    lobby: {
        title: 'Lobby',
        roomCode: 'Codice Stanza',
        playersCount: 'Giocatori ({{current}}/{{max}})',
        waitingForMore: 'In attesa di altri giocatori...'
    },

    // Leaderboard
    leaderboard: {
        title: 'Classifica Globale',
        soloClassic: 'Solo Classica',
        soloExtreme: 'Solo Estrema',
        timed: 'A Tempo (3 min)',
        competitive: 'Competitiva',
        cooperative: 'Cooperativa',
        updated: 'Aggiornato {{time}}',
        loading: 'Caricamento classifiche...',
        noScores: 'Nessun punteggio registrato. Sii il primo!',
        serverOffline: 'Server offline - Classifiche non disponibili. Il server potrebbe essere in avvio o temporaneamente non disponibile.',
        loadFailed: 'Impossibile caricare le classifiche. Riprova.',
        ranks: {
            first: '1°',
            second: '2°',
            third: '3°'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'Pecore',
        stamina: 'Resistenza',
        time: 'Tempo',
        score: 'Punteggio',
        timeRemaining: 'Tempo Rimanente',
        complete: 'completato'
    },

    // Pause menu
    pause: {
        title: 'PAUSA',
        tapToResume: 'Tocca fuori per riprendere',
        pressEscToResume: 'Premi ESC per riprendere',
        resume: 'Riprendi',
        restart: 'Ricomincia',
        mainMenu: 'Menu Principale',
        fullscreen: 'Schermo Intero',
        exitFullscreen: 'Esci da Schermo Intero'
    },

    // Completion screen
    completion: {
        victory: 'Vittoria!',
        allSheepHerded: 'Tutte le {{count}} pecore radunate con successo!',
        raceComplete: 'Gara Completata',
        youWon: 'Hai vinto!',
        playerWon: '{{name}} ha vinto!',
        timesUp: 'Tempo Scaduto',
        timesUpVictory: 'Tempo Scaduto - Vittoria!',
        youCollectedMost: 'Hai raccolto più pecore di tutti!',
        playerCollectedMost: '{{name}} ha raccolto di più!',
        teamVictory: 'Vittoria di Squadra!',
        teamMessage: 'Lavorando insieme, avete radunato tutte le pecore!',
        gameComplete: 'Partita Completata',
        wellPlayed: 'Ben giocato!',
        newPersonalBest: 'NUOVO RECORD PERSONALE!',
        finalStandings: 'Classifica Finale',
        playAgain: 'Gioca Ancora',
        nextChallenge: 'Prossima Sfida',
        stats: {
            time: 'Tempo',
            yourScore: 'Il tuo Punteggio',
            raceTime: 'Tempo Gara',
            duration: 'Durata',
            sheepCollected: 'Pecore Raccolte',
            teamTime: 'Tempo Squadra'
        },
        sheepUnit: '{{count}} pecore'
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'Qualcosa è andato storto',
        uiError: "L'interfaccia ha riscontrato un errore. Prova ad aggiornare la pagina.",
        reloadPage: 'Ricarica Pagina',
        errorDetails: "Dettagli dell'errore",
        connectionFailed: 'Impossibile connettersi al server multiplayer.',
        gameNotLoaded: 'Gioco non completamente caricato.',
        createRoomFailed: 'Impossibile creare la stanza.',
        joinRoomFailed: 'Impossibile unirsi alla stanza',
        noAvailableRooms: 'Nessuna stanza disponibile',
        roomCodeLength: 'Il codice stanza deve essere di 6 caratteri'
    },

    // Welcome / Identity
    identity: {
        welcome: 'Benvenuto in Simulatore Cane Pastore!',
        chooseIdentity: 'Scegli come vuoi essere conosciuto:',
        welcomeBack: 'Bentornato, {{name}}!',
        confirmSelection: 'Conferma Selezione'
    }
};
