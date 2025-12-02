/**
 * Polish Translations
 * Polskie tłumaczenie
 */

export default {
    // Common UI elements
    common: {
        back: 'Wstecz',
        backToMenu: '← Wróć do menu',
        start: 'Start',
        cancel: 'Anuluj',
        confirm: 'Potwierdź',
        save: 'Zapisz',
        close: 'Zamknij',
        loading: 'Ładowanie...',
        error: 'Błąd',
        retry: 'Spróbuj ponownie',
        refresh: 'Odśwież',
        copy: 'Kopiuj',
        copied: 'Skopiowano!',
        you: 'Ty',
        host: 'Gospodarz',
        waiting: 'Oczekiwanie...',
        players: 'Gracze',
        player: 'Gracz'
    },

    // Main menu / Mode selection
    menu: {
        title: 'Symulator Psa Pasterskiego',
        soloPlay: 'Gra Solo',
        soloPlayDesc: 'Ćwicz zaganianie we własnym tempie',
        local2Player: 'Lokalnie 2 graczy',
        local2PlayerDesc: 'Współpraca lub rywalizacja na jednym ekranie',
        sandbox: 'Sandbox',
        sandboxDesc: 'Dostosuj owce, ogrodzenia i zasady',
        multiplayer: 'Wieloosobowa',
        multiplayerDesc: 'Współpracuj lub rywalizuj online',
        leaderboard: 'Ranking',
        leaderboardDesc: 'Zobacz globalne rankingi',
        settings: 'Ustawienia',
        settingsDesc: 'Dostosuj ustawienia gry'
    },

    // Dog selection
    dogs: {
        title: 'Wybierz swojego psa',
        stats: {
            speed: 'Szybkość',
            stamina: 'Wytrzymałość',
            control: 'Kontrola'
        },
        jep: {
            name: 'Jep',
            breed: 'Border Collie',
            description: 'Zrównoważony pasterz z dobrą wytrzymałością'
        },
        pip: {
            name: 'Pip',
            breed: 'Owczarek Australijski',
            description: 'Szybki i zwinny, idealny do szybkiego zaganiania'
        },
        sally: {
            name: 'Sally',
            breed: 'Welsh Corgi',
            description: 'Świetna kontrola, ale wolniejszy ruch'
        },
        shiloh: {
            name: 'Shiloh',
            breed: 'Owczarek Niemiecki',
            description: 'Silny i stabilny z doskonałą wytrzymałością'
        },
        georgeWashington: {
            name: 'George Washington',
            breed: 'American Foxhound',
            description: 'Taktyczny pasterz ze zrównoważonymi umiejętnościami'
        }
    },

    // Game modes
    modes: {
        title: 'Wybierz tryb gry',
        classic: 'Tryb Klasyczny',
        classicDesc: 'Zapędź wszystkie 200 owiec na pastwisko',
        extreme: 'Tryb Ekstremalny',
        extremeDesc: 'Zapędź wszystkie 1000 owiec - wyzwanie wydajności!'
    },

    // Settings panel
    settings: {
        title: 'Ustawienia',
        performanceMode: 'Tryb Wydajności',
        performanceOption: 'Wydajność - Maksymalne FPS',
        balancedOption: 'Zrównoważony - Domyślne ustawienia',
        qualityOption: 'Jakość - Najlepsza grafika',
        audioEnabled: 'Dźwięk Włączony',
        audioVolume: 'Głośność',
        showStats: 'Pokaż statystyki wydajności',
        resetDefaults: 'Przywróć domyślne',
        language: 'Język'
    },

    // Sandbox setup
    sandbox: {
        title: 'Ustawienia Sandbox',
        sheepCount: 'Liczba Owiec',
        numberOfSheep: 'Liczba owiec',
        behavior: 'Zachowanie',
        movementSpeed: 'Prędkość Ruchu',
        flockCohesion: 'Spójność Stada',
        separationDistance: 'Dystans Separacji',
        fieldSize: 'Rozmiar Pola',
        fieldShape: 'Kształt Pola',
        fenceLayout: 'Układ Ogrodzeń',
        editFenceLayout: 'Edytuj układ ogrodzeń',
        editCustomShape: 'Edytuj własny kształt',
        drawCustomShape: 'Narysuj własny kształt',
        timer: 'Timer',
        enableTimer: 'Włącz timer',
        countUp: 'Liczenie w górę',
        countUpDesc: 'Śledź swój czas',
        countdown: 'Odliczanie',
        countdownDesc: 'Wyścig z czasem',
        timeLimit: 'Limit Czasu',
        winCondition: 'Warunek Zwycięstwa',
        herdAllSheep: 'Zapędź Wszystkie Owce',
        herdAllSheepDesc: 'Klasyczne ukończenie - wszystkie owce na pastwisko',
        percentageGoal: 'Cel Procentowy',
        percentageGoalDesc: 'Ukończ po osiągnięciu docelowego procentu',
        targetPercentage: 'Docelowy Procent',
        freePlay: 'Swobodna Gra',
        freePlayDesc: 'Bez warunku zwycięstwa - po prostu graj!',
        startGame: 'Rozpocznij Grę',
        startGameWithCount: 'Rozpocznij Grę ({{count}} owiec)',
        tabs: {
            sheep: 'Owce',
            field: 'Pole',
            rules: 'Zasady'
        },
        sizes: {
            small: 'Małe',
            medium: 'Średnie',
            large: 'Duże',
            huge: 'Ogromne'
        },
        shapes: {
            square: 'Kwadrat',
            wide: 'Szerokie',
            tall: 'Wysokie',
            lShape: 'Kształt L',
            circle: 'Koło',
            diamond: 'Romb',
            triangle: 'Trójkąt',
            custom: 'Własny'
        },
        fencePresets: {
            open: 'Otwarte Pole',
            openDesc: 'Bez wewnętrznych ogrodzeń',
            corridor: 'Korytarz',
            corridorDesc: 'Ogrodzona ścieżka do bramy',
            funnel: 'Lejek',
            funnelDesc: 'Zwężająca się ścieżka do bramy',
            maze: 'Labirynt',
            mazeDesc: 'Przeszkody do nawigacji',
            obstacles: 'Przeszkody',
            obstaclesDesc: 'Losowe przeszkody',
            custom: 'Własny',
            customDesc: 'Zaprojektuj własny układ'
        }
    },

    // Local 2-player mode
    localMode: {
        title: 'Lokalnie 2 Graczy',
        coop: 'Współpraca',
        coopDesc: 'Wspólnie zapędźcie 200 owiec',
        versus: 'Wyścig 1v1',
        versusDesc: 'Pierwszy do 100 owiec wygrywa!',
        timed: 'Na Czas',
        timedDesc: '3 minuty - owce się odradzają!',
        player: 'Gracz',
        controls1: 'WASD + Lewy Shift',
        controls2: 'Strzałki + Prawy Shift',
        startGame: 'Rozpocznij Grę',
        noLeaderboards: 'Wyniki w trybie lokalnym nie są wysyłane do rankingu'
    },

    // Fence editor
    fenceEditor: {
        title: 'Układ Ogrodzeń',
        fenceCount: '{{count}} ogrodzenie',
        fenceCountPlural: '{{count}} ogrodzeń',
        quickLayouts: 'Szybkie Układy',
        tools: 'Narzędzia',
        draw: 'Rysuj',
        select: 'Wybierz',
        erase: 'Wymaż',
        pan: 'Przesuń',
        clearAll: 'Wyczyść Wszystko',
        done: 'Gotowe',
        dogLabel: 'PIES',
        sheepSpawn: 'Punkt Pojawienia Owiec',
        helpDraw: 'Kliknij i przeciągnij, aby rysować ogrodzenia - Siatka 10m',
        helpErase: 'Kliknij ogrodzenie, aby je usunąć',
        helpPan: 'Przeciągnij, aby przesunąć - Przewiń, aby powiększyć',
        helpSelect: 'Kliknij ogrodzenie, aby je wybrać',
        presets: {
            open: 'Czyste pole',
            corridor: 'Prowadząca ścieżka',
            funnel: 'Zwężanie',
            maze: 'Nawiguj przeszkody',
            obstacles: 'Losowe bloki'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'Wieloosobowa',
        createRoom: 'Utwórz Pokój',
        createRoomDesc: 'Utwórz nowy pokój gry',
        joinRoom: 'Dołącz do Pokoju',
        joinRoomDesc: 'Wprowadź kod pokoju',
        quickMatch: 'Szybki Mecz',
        quickMatchDesc: 'Znajdź dostępną grę',
        maxPlayers: 'Maks. Graczy',
        playersCount: '{{count}} Graczy',
        gameMode: 'Tryb Gry',
        cooperative: 'Kooperacyjny',
        cooperativeDesc: 'Wspólnie zapędźcie wszystkie owce do zagrody',
        competitive: 'Rywalizacyjny',
        competitiveDesc: 'Zbierz więcej owiec niż przeciwnicy',
        timed: 'Na Czas (3 min)',
        timedDesc: 'Zdobądź jak najwięcej punktów w 3 minuty',
        roomCode: 'Kod Pokoju',
        enterRoomCode: 'Wprowadź kod pokoju',
        leaveRoom: 'Opuść Pokój',
        startGame: 'Rozpocznij Grę',
        waitingForPlayers: 'Oczekiwanie na graczy...'
    },

    // Lobby
    lobby: {
        title: 'Lobby Gry',
        roomCode: 'Kod Pokoju',
        playersCount: 'Gracze ({{current}}/{{max}})',
        waitingForMore: 'Oczekiwanie na więcej graczy...'
    },

    // Leaderboard
    leaderboard: {
        title: 'Globalny Ranking',
        soloClassic: 'Solo Klasyczny',
        soloExtreme: 'Solo Ekstremalny',
        timed: 'Na Czas (3 min)',
        competitive: 'Rywalizacyjny',
        cooperative: 'Kooperacyjny',
        updated: 'Zaktualizowano {{time}}',
        loading: 'Ładowanie rankingu...',
        noScores: 'Brak zapisanych wyników. Bądź pierwszy!',
        serverOffline: 'Serwer offline - Ranking niedostępny. Serwer może się uruchamiać lub być tymczasowo niedostępny.',
        loadFailed: 'Nie udało się załadować rankingu. Spróbuj ponownie.',
        ranks: {
            first: '1.',
            second: '2.',
            third: '3.'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'Owce',
        stamina: 'Wytrzymałość',
        time: 'Czas',
        score: 'Wynik',
        timeRemaining: 'Pozostały Czas',
        complete: 'ukończono'
    },

    // Pause menu
    pause: {
        title: 'PAUZA',
        tapToResume: 'Dotknij poza, aby wznowić',
        pressEscToResume: 'Naciśnij ESC, aby wznowić',
        resume: 'Wznów',
        restart: 'Restart',
        mainMenu: 'Menu Główne',
        fullscreen: 'Pełny Ekran',
        exitFullscreen: 'Opuść Pełny Ekran'
    },

    // Completion screen
    completion: {
        victory: 'Zwycięstwo!',
        allSheepHerded: 'Wszystkie {{count}} owiec pomyślnie zapędzonych!',
        raceComplete: 'Wyścig Ukończony',
        youWon: 'Wygrałeś!',
        playerWon: '{{name}} wygrał!',
        timesUp: 'Czas Minął',
        timesUpVictory: 'Czas Minął - Zwycięstwo!',
        youCollectedMost: 'Zebrałeś najwięcej owiec!',
        playerCollectedMost: '{{name}} zebrał najwięcej!',
        teamVictory: 'Zwycięstwo Drużyny!',
        teamMessage: 'Pracując razem, zapędziliście wszystkie owce!',
        gameComplete: 'Gra Ukończona',
        wellPlayed: 'Dobrze zagrane!',
        newPersonalBest: 'NOWY REKORD OSOBISTY!',
        finalStandings: 'Końcowa Klasyfikacja',
        playAgain: 'Zagraj Ponownie',
        nextChallenge: 'Następne Wyzwanie',
        stats: {
            time: 'Czas',
            yourScore: 'Twój Wynik',
            raceTime: 'Czas Wyścigu',
            duration: 'Czas Trwania',
            sheepCollected: 'Zebrane Owce',
            teamTime: 'Czas Drużyny'
        },
        sheepUnit: '{{count}} owiec'
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'Coś poszło nie tak',
        uiError: 'Interfejs gry napotkał błąd. Spróbuj odświeżyć stronę.',
        reloadPage: 'Odśwież Stronę',
        errorDetails: 'Szczegóły błędu',
        connectionFailed: 'Nie można połączyć z serwerem wieloosobowym.',
        gameNotLoaded: 'Gra nie jest w pełni załadowana.',
        createRoomFailed: 'Nie udało się utworzyć pokoju.',
        joinRoomFailed: 'Nie udało się dołączyć do pokoju',
        noAvailableRooms: 'Brak dostępnych pokoi',
        roomCodeLength: 'Kod pokoju musi mieć 6 znaków'
    },

    // Welcome / Identity
    identity: {
        welcome: 'Witaj w Symulatorze Psa Pasterskiego!',
        chooseIdentity: 'Wybierz, jak chcesz być znany:',
        welcomeBack: 'Witaj ponownie, {{name}}!',
        confirmSelection: 'Potwierdź Wybór'
    }
};
