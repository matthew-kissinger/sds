/**
 * German Translations
 * Deutsche Übersetzungen für Sheep Dog Simulator
 */

export default {
    // Common UI elements
    common: {
        back: 'Zurück',
        backToMenu: '← Zurück zum Menü',
        start: 'Starten',
        cancel: 'Abbrechen',
        confirm: 'Bestätigen',
        save: 'Speichern',
        close: 'Schließen',
        loading: 'Laden...',
        error: 'Fehler',
        retry: 'Erneut versuchen',
        refresh: 'Aktualisieren',
        copy: 'Kopieren',
        copied: 'Kopiert!',
        you: 'Du',
        host: 'Host',
        waiting: 'Warten...',
        players: 'Spieler',
        player: 'Spieler'
    },

    // Main menu / Mode selection
    menu: {
        title: 'Sheep Dog Sim',
        soloPlay: 'Solo Spielen',
        soloPlayDesc: 'Übe Hüten in deinem eigenen Tempo',
        local2Player: 'Lokaler 2-Spieler',
        local2PlayerDesc: 'Koop oder Wettkampf auf einem Bildschirm',
        sandbox: 'Sandbox',
        sandboxDesc: 'Schafe, Zäune & Regeln anpassen',
        multiplayer: 'Mehrspieler',
        multiplayerDesc: 'Online wettkämpfen oder kooperieren',
        leaderboard: 'Rangliste',
        leaderboardDesc: 'Globale Ranglisten ansehen',
        settings: 'Einstellungen',
        settingsDesc: 'Spieleinstellungen anpassen'
    },

    // Dog selection
    dogs: {
        title: 'Wähle deinen Hund',
        stats: {
            speed: 'Geschwindigkeit',
            stamina: 'Ausdauer',
            control: 'Kontrolle'
        },
        jep: {
            name: 'Jep',
            breed: 'Border Collie',
            description: 'Ausgewogener Hütehund mit guter Ausdauer'
        },
        pip: {
            name: 'Pip',
            breed: 'Australian Shepherd',
            description: 'Schnell und wendig, perfekt für schnelles Hüten'
        },
        sally: {
            name: 'Sally',
            breed: 'Welsh Corgi',
            description: 'Tolle Kontrolle, aber langsamere Bewegung'
        },
        shiloh: {
            name: 'Shiloh',
            breed: 'Deutscher Schäferhund',
            description: 'Stark und stetig mit ausgezeichneter Ausdauer'
        },
        georgeWashington: {
            name: 'George Washington',
            breed: 'Amerikanischer Foxhound',
            description: 'Taktischer Hütehund mit ausgewogenen Fähigkeiten'
        }
    },

    // Game modes
    modes: {
        title: 'Spielmodus wählen',
        classic: 'Klassischer Modus',
        classicDesc: 'Hüte alle 200 Schafe zur Weide',
        extreme: 'Extremer Modus',
        extremeDesc: 'Hüte alle 1000 Schafe - Leistungs-Herausforderung!'
    },

    // Settings panel
    settings: {
        title: 'Einstellungen',
        performanceMode: 'Leistungsmodus',
        performanceOption: 'Leistung - Maximale FPS',
        balancedOption: 'Ausgewogen - Standardeinstellungen',
        qualityOption: 'Qualität - Beste Grafik',
        audioEnabled: 'Audio aktiviert',
        audioVolume: 'Lautstärke',
        showStats: 'Leistungsstatistiken anzeigen',
        resetDefaults: 'Auf Standard zurücksetzen',
        language: 'Sprache'
    },

    // Sandbox setup
    sandbox: {
        title: 'Sandbox-Einrichtung',
        sheepCount: 'Schafanzahl',
        numberOfSheep: 'Anzahl der Schafe',
        behavior: 'Verhalten',
        movementSpeed: 'Bewegungsgeschwindigkeit',
        flockCohesion: 'Herdenzusammenhalt',
        separationDistance: 'Trennungsabstand',
        fieldSize: 'Feldgröße',
        fieldShape: 'Feldform',
        fenceLayout: 'Zaunlayout',
        startGame: 'Spiel starten',
        startGameWithCount: 'Spiel starten ({{count}} Schafe)',
        tabs: {
            sheep: 'Schafe',
            field: 'Feld',
            rules: 'Regeln'
        },
        sizes: {
            small: 'Klein',
            medium: 'Mittel',
            large: 'Groß',
            huge: 'Riesig'
        },
        shapes: {
            square: 'Quadrat',
            wide: 'Breit',
            tall: 'Hoch',
            lShape: 'L-Form',
            circle: 'Kreis',
            diamond: 'Raute',
            triangle: 'Dreieck',
            custom: 'Benutzerdefiniert'
        },
        fencePresets: {
            open: 'Offenes Feld',
            openDesc: 'Keine inneren Zäune',
            corridor: 'Korridor',
            corridorDesc: 'Eingezäunter Weg zum Tor',
            funnel: 'Trichter',
            funnelDesc: 'Verengender Weg zum Tor',
            maze: 'Labyrinth',
            mazeDesc: 'Hindernisse zum Navigieren',
            obstacles: 'Hindernisse',
            obstaclesDesc: 'Zufällige Zaunhindernisse',
            custom: 'Benutzerdefiniert',
            customDesc: 'Gestalte dein eigenes Layout'
        }
    },

    // Local 2-player mode
    localMode: {
        title: 'Lokaler 2-Spieler',
        coop: 'Koop',
        coopDesc: 'Arbeitet zusammen, um 200 Schafe zu hüten',
        versus: '1v1 Rennen',
        versusDesc: 'Wer zuerst 100 Schafe hat, gewinnt!',
        timed: 'Zeitbegrenzt',
        timedDesc: '3 Minuten - Schafe erscheinen wieder!',
        player: 'Spieler',
        controls1: 'WASD + L.Shift',
        controls2: 'Pfeiltasten + R.Shift',
        startGame: 'Spiel starten',
        noLeaderboards: 'Punkte im lokalen Modus werden nicht in die Rangliste eingetragen'
    },

    // Fence editor
    fenceEditor: {
        title: 'Zaunlayout',
        fenceCount: '{{count}} Zaun',
        fenceCountPlural: '{{count}} Zäune',
        quickLayouts: 'Schnelllayouts',
        tools: 'Werkzeuge',
        draw: 'Zeichnen',
        select: 'Auswählen',
        erase: 'Löschen',
        pan: 'Schwenken',
        clearAll: 'Alles löschen',
        done: 'Fertig',
        dogLabel: 'HUND',
        sheepSpawn: 'Schaf-Spawn',
        helpDraw: 'Klicken und ziehen zum Zeichnen - 10m Raster',
        helpErase: 'Klicken Sie auf einen Zaun zum Löschen',
        helpPan: 'Ziehen zum Schwenken - Scrollen zum Zoomen',
        helpSelect: 'Klicken Sie auf einen Zaun zum Auswählen',
        presets: {
            open: 'Freies Feld',
            corridor: 'Geführter Weg',
            funnel: 'Verengung',
            maze: 'Hindernisse navigieren',
            obstacles: 'Zufällige Blöcke'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'Mehrspieler',
        createRoom: 'Raum erstellen',
        createRoomDesc: 'Einen neuen Spielraum hosten',
        joinRoom: 'Raum beitreten',
        joinRoomDesc: 'Raumcode eingeben',
        quickMatch: 'Schnellspiel',
        quickMatchDesc: 'Ein verfügbares Spiel finden',
        maxPlayers: 'Max. Spieler',
        playersCount: '{{count}} Spieler',
        gameMode: 'Spielmodus',
        cooperative: 'Kooperativ',
        cooperativeDesc: 'Arbeitet zusammen, um alle Schafe in den Pferch zu treiben',
        competitive: 'Wettkampf',
        competitiveDesc: 'Wettlauf, um die meisten Schafe zu sammeln',
        timed: 'Zeitbegrenzt (3 Min)',
        timedDesc: 'Sammle so viele Punkte wie möglich in 3 Minuten',
        roomCode: 'Raumcode',
        enterRoomCode: 'Raumcode eingeben',
        leaveRoom: 'Raum verlassen',
        startGame: 'Spiel starten',
        waitingForPlayers: 'Warte auf Spieler...'
    },

    // Lobby
    lobby: {
        title: 'Spiellobby',
        roomCode: 'Raumcode',
        playersCount: 'Spieler ({{current}}/{{max}})',
        waitingForMore: 'Warte auf weitere Spieler...'
    },

    // Leaderboard
    leaderboard: {
        title: 'Globale Rangliste',
        soloClassic: 'Solo Klassisch',
        soloExtreme: 'Solo Extrem',
        timed: 'Zeitbegrenzt',
        competitive: 'Wettkampf',
        cooperative: 'Kooperativ',
        updated: 'Aktualisiert {{time}}',
        loading: 'Ranglisten werden geladen...',
        noScores: 'Noch keine Punktzahlen. Sei der Erste!',
        serverOffline: 'Server offline - Ranglisten nicht verfügbar.',
        loadFailed: 'Ranglisten konnten nicht geladen werden. Bitte erneut versuchen.',
        ranks: {
            first: '1.',
            second: '2.',
            third: '3.'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'Schafe',
        stamina: 'Ausdauer',
        time: 'Zeit',
        score: 'Punkte',
        timeRemaining: 'Verbleibende Zeit',
        complete: 'abgeschlossen'
    },

    // Pause menu
    pause: {
        title: 'PAUSIERT',
        tapToResume: 'Außerhalb tippen zum Fortsetzen',
        pressEscToResume: 'ESC drücken zum Fortsetzen',
        resume: 'Fortsetzen',
        restart: 'Neustart',
        mainMenu: 'Hauptmenü',
        fullscreen: 'Vollbild',
        exitFullscreen: 'Vollbild beenden'
    },

    // Completion screen
    completion: {
        victory: 'Sieg!',
        allSheepHerded: 'Alle {{count}} Schafe erfolgreich gehütet!',
        raceComplete: 'Rennen beendet',
        youWon: 'Du hast das Rennen gewonnen!',
        playerWon: '{{name}} hat gewonnen!',
        timesUp: 'Zeit abgelaufen',
        timesUpVictory: 'Zeit abgelaufen - Sieg!',
        youCollectedMost: 'Du hast die meisten Schafe gesammelt!',
        playerCollectedMost: '{{name}} hat die meisten gesammelt!',
        teamVictory: 'Team-Sieg!',
        teamMessage: 'Gemeinsam habt ihr alle Schafe gehütet!',
        gameComplete: 'Spiel beendet',
        wellPlayed: 'Gut gespielt!',
        newPersonalBest: 'NEUER PERSÖNLICHER REKORD!',
        finalStandings: 'Endstand',
        playAgain: 'Nochmal spielen',
        nextChallenge: 'Nächste Herausforderung',
        stats: {
            time: 'Zeit',
            yourScore: 'Deine Punkte',
            raceTime: 'Rennzeit',
            duration: 'Dauer',
            sheepCollected: 'Gesammelte Schafe',
            teamTime: 'Teamzeit'
        },
        sheepUnit: '{{count}} Schafe'
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'Etwas ist schiefgelaufen',
        uiError: 'Die Spiel-UI hat einen Fehler. Versuche die Seite neu zu laden.',
        reloadPage: 'Seite neu laden',
        errorDetails: 'Fehlerdetails',
        connectionFailed: 'Verbindung zum Mehrspieler-Server fehlgeschlagen.',
        gameNotLoaded: 'Spiel nicht vollständig geladen.',
        createRoomFailed: 'Raum konnte nicht erstellt werden.',
        joinRoomFailed: 'Raum konnte nicht beigetreten werden',
        noAvailableRooms: 'Keine verfügbaren Räume',
        roomCodeLength: 'Der Raumcode muss 6 Zeichen haben'
    },

    // Welcome / Identity
    identity: {
        welcome: 'Willkommen bei Sheep Dog Sim!',
        chooseIdentity: 'Wähle, wie du bekannt sein möchtest:',
        welcomeBack: 'Willkommen zurück, {{name}}!',
        confirmSelection: 'Auswahl bestätigen',
        continue: 'Weiter →',
        settingUp: 'Wird eingerichtet...',
        customName: 'Eigener Name',
        customNameDesc: 'Wähle deinen eigenen Anzeigenamen',
        enterName: 'Gib deinen Namen ein...',
        randomName: 'Zufälliger Name',
        randomNameDesc: 'Erhalte einen zufällig generierten Hütehund-Namen',
        anonymous: 'Anonym bleiben',
        anonymousDesc: 'Als "Spieler" ohne eigenen Namen spielen',
        errorEmpty: 'Bitte gib einen Anzeigenamen ein oder wähle eine andere Option',
        errorTooLong: 'Der Anzeigename darf maximal 20 Zeichen lang sein',
        errorFailed: 'Spieler-Identität konnte nicht erstellt werden. Bitte versuche es erneut.'
    }
};
