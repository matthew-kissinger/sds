/**
 * Hindi Translations
 * हिंदी अनुवाद
 */

export default {
    // Common UI elements
    common: {
        back: 'वापस',
        backToMenu: '← मेनू पर वापस',
        start: 'शुरू करें',
        cancel: 'रद्द करें',
        confirm: 'पुष्टि करें',
        save: 'सेव करें',
        close: 'बंद करें',
        loading: 'लोड हो रहा है...',
        error: 'त्रुटि',
        retry: 'फिर से कोशिश करें',
        refresh: 'रिफ्रेश करें',
        copy: 'कॉपी',
        copied: 'कॉपी हो गया!',
        you: 'आप',
        host: 'होस्ट',
        waiting: 'प्रतीक्षा कर रहे हैं...',
        players: 'खिलाड़ी',
        player: 'खिलाड़ी'
    },

    // Main menu / Mode selection
    menu: {
        title: 'शीपडॉग सिम्युलेटर',
        soloPlay: 'सोलो खेलें',
        soloPlayDesc: 'अपनी गति से भेड़ चराने का अभ्यास करें',
        local2Player: 'लोकल 2 खिलाड़ी',
        local2PlayerDesc: 'एक स्क्रीन पर सहयोग या प्रतिस्पर्धा',
        sandbox: 'सैंडबॉक्स',
        sandboxDesc: 'भेड़, बाड़ और नियम कस्टमाइज़ करें',
        multiplayer: 'मल्टीप्लेयर',
        multiplayerDesc: 'ऑनलाइन सहयोग या प्रतिस्पर्धा',
        leaderboard: 'लीडरबोर्ड',
        leaderboardDesc: 'वैश्विक रैंकिंग देखें',
        settings: 'सेटिंग्स',
        settingsDesc: 'गेम सेटिंग्स बदलें'
    },

    // Dog selection
    dogs: {
        title: 'अपना कुत्ता चुनें',
        stats: {
            speed: 'गति',
            stamina: 'सहनशक्ति',
            control: 'नियंत्रण'
        },
        jep: {
            name: 'जेप',
            breed: 'बॉर्डर कॉली',
            description: 'अच्छी सहनशक्ति के साथ संतुलित चरवाहा'
        },
        pip: {
            name: 'पिप',
            breed: 'ऑस्ट्रेलियन शेफर्ड',
            description: 'तेज और फुर्तीला, तेज चराने के लिए बेहतरीन'
        },
        sally: {
            name: 'सैली',
            breed: 'वेल्श कॉर्गी',
            description: 'बढ़िया नियंत्रण लेकिन धीमी गति'
        },
        shiloh: {
            name: 'शाइलो',
            breed: 'जर्मन शेफर्ड',
            description: 'मजबूत और स्थिर, उत्कृष्ट सहनशक्ति'
        },
        georgeWashington: {
            name: 'जॉर्ज वाशिंगटन',
            breed: 'अमेरिकन फॉक्सहाउंड',
            description: 'संतुलित क्षमताओं वाला रणनीतिक चरवाहा'
        }
    },

    // Game modes
    modes: {
        title: 'गेम मोड चुनें',
        classic: 'क्लासिक मोड',
        classicDesc: 'सभी 200 भेड़ों को चरागाह में ले जाएं',
        extreme: 'एक्सट्रीम मोड',
        extremeDesc: 'सभी 1000 भेड़ों को चराएं - परफॉर्मेंस चैलेंज!'
    },

    // Settings panel
    settings: {
        title: 'सेटिंग्स',
        performanceMode: 'परफॉर्मेंस मोड',
        performanceOption: 'परफॉर्मेंस - अधिकतम FPS',
        balancedOption: 'संतुलित - डिफ़ॉल्ट सेटिंग्स',
        qualityOption: 'क्वालिटी - सर्वश्रेष्ठ विज़ुअल्स',
        audioEnabled: 'ऑडियो चालू',
        audioVolume: 'ऑडियो वॉल्यूम',
        showStats: 'परफॉर्मेंस स्टैट्स दिखाएं',
        resetDefaults: 'डिफ़ॉल्ट पर रीसेट',
        language: 'भाषा'
    },

    // Sandbox setup
    sandbox: {
        title: 'सैंडबॉक्स सेटअप',
        sheepCount: 'भेड़ों की संख्या',
        numberOfSheep: 'भेड़ों की संख्या',
        behavior: 'व्यवहार',
        movementSpeed: 'गति की रफ्तार',
        flockCohesion: 'झुंड की एकता',
        separationDistance: 'अलगाव की दूरी',
        fieldSize: 'मैदान का आकार',
        fieldShape: 'मैदान की आकृति',
        fenceLayout: 'बाड़ का लेआउट',
        editFenceLayout: 'बाड़ लेआउट संपादित करें',
        editCustomShape: 'कस्टम आकृति संपादित करें',
        drawCustomShape: 'कस्टम आकृति बनाएं',
        timer: 'टाइमर',
        enableTimer: 'टाइमर सक्षम करें',
        countUp: 'ऊपर गिनें',
        countUpDesc: 'अपना समय ट्रैक करें',
        countdown: 'उलटी गिनती',
        countdownDesc: 'समय के खिलाफ दौड़',
        timeLimit: 'समय सीमा',
        winCondition: 'जीत की शर्त',
        herdAllSheep: 'सभी भेड़ें चराएं',
        herdAllSheepDesc: 'क्लासिक पूर्णता - सभी भेड़ें चरागाह में',
        percentageGoal: 'प्रतिशत लक्ष्य',
        percentageGoalDesc: 'लक्ष्य प्रतिशत पर पूर्ण',
        targetPercentage: 'लक्ष्य प्रतिशत',
        freePlay: 'फ्री प्ले',
        freePlayDesc: 'कोई जीत शर्त नहीं - बस खेलें!',
        startGame: 'गेम शुरू करें',
        startGameWithCount: 'गेम शुरू करें ({{count}} भेड़)',
        tabs: {
            sheep: 'भेड़',
            field: 'मैदान',
            rules: 'नियम'
        },
        sizes: {
            small: 'छोटा',
            medium: 'मध्यम',
            large: 'बड़ा',
            huge: 'विशाल'
        },
        shapes: {
            square: 'वर्ग',
            wide: 'चौड़ा',
            tall: 'लंबा',
            lShape: 'L-आकार',
            circle: 'वृत्त',
            diamond: 'हीरा',
            triangle: 'त्रिभुज',
            custom: 'कस्टम'
        },
        fencePresets: {
            open: 'खुला मैदान',
            openDesc: 'कोई आंतरिक बाड़ नहीं',
            corridor: 'गलियारा',
            corridorDesc: 'गेट तक बाड़ वाला रास्ता',
            funnel: 'फनल',
            funnelDesc: 'गेट की ओर सकरा रास्ता',
            maze: 'भूलभुलैया',
            mazeDesc: 'नेविगेट करने के लिए बाधाएं',
            obstacles: 'बाधाएं',
            obstaclesDesc: 'रैंडम बाड़ बाधाएं',
            custom: 'कस्टम',
            customDesc: 'अपना खुद का लेआउट डिज़ाइन करें'
        }
    },

    // Local 2-player mode
    localMode: {
        title: 'लोकल 2 खिलाड़ी',
        coop: 'को-ऑप',
        coopDesc: 'मिलकर 200 भेड़ें चराएं',
        versus: '1v1 रेस',
        versusDesc: 'पहले 100 भेड़ें जीतता है!',
        timed: 'टाइमड',
        timedDesc: '3 मिनट - भेड़ें रीस्पॉन होती हैं!',
        player: 'खिलाड़ी',
        controls1: 'WASD + बायां Shift',
        controls2: 'एरो + दायां Shift',
        startGame: 'गेम शुरू करें',
        noLeaderboards: 'लोकल मोड के स्कोर लीडरबोर्ड में नहीं जाते'
    },

    // Fence editor
    fenceEditor: {
        title: 'बाड़ लेआउट',
        fenceCount: '{{count}} बाड़',
        fenceCountPlural: '{{count}} बाड़',
        quickLayouts: 'क्विक लेआउट',
        tools: 'टूल्स',
        draw: 'ड्रॉ',
        select: 'सेलेक्ट',
        erase: 'मिटाएं',
        pan: 'पैन',
        clearAll: 'सब मिटाएं',
        done: 'हो गया',
        dogLabel: 'कुत्ता',
        sheepSpawn: 'भेड़ स्पॉन पॉइंट',
        helpDraw: 'बाड़ बनाने के लिए क्लिक और ड्रैग करें - ग्रिड 10m',
        helpErase: 'हटाने के लिए बाड़ पर क्लिक करें',
        helpPan: 'पैन के लिए ड्रैग करें - ज़ूम के लिए स्क्रॉल करें',
        helpSelect: 'चुनने के लिए बाड़ पर क्लिक करें',
        presets: {
            open: 'खाली मैदान',
            corridor: 'गाइडेड पथ',
            funnel: 'सकरा होता',
            maze: 'बाधाएं पार करें',
            obstacles: 'रैंडम ब्लॉक'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'मल्टीप्लेयर',
        createRoom: 'रूम बनाएं',
        createRoomDesc: 'नया गेम रूम होस्ट करें',
        joinRoom: 'रूम जॉइन करें',
        joinRoomDesc: 'रूम कोड डालें',
        quickMatch: 'क्विक मैच',
        quickMatchDesc: 'उपलब्ध गेम खोजें',
        maxPlayers: 'अधिकतम खिलाड़ी',
        playersCount: '{{count}} खिलाड़ी',
        gameMode: 'गेम मोड',
        cooperative: 'सहयोगी',
        cooperativeDesc: 'मिलकर सभी भेड़ों को बाड़े में ले जाएं',
        competitive: 'प्रतिस्पर्धी',
        competitiveDesc: 'सबसे ज्यादा भेड़ें इकट्ठा करने की रेस',
        timed: 'टाइमड (3 मिनट)',
        timedDesc: '3 मिनट में ज्यादा से ज्यादा स्कोर करें',
        roomCode: 'रूम कोड',
        enterRoomCode: 'रूम कोड डालें',
        leaveRoom: 'रूम छोड़ें',
        startGame: 'गेम शुरू करें',
        waitingForPlayers: 'खिलाड़ियों का इंतजार...'
    },

    // Lobby
    lobby: {
        title: 'गेम लॉबी',
        roomCode: 'रूम कोड',
        playersCount: 'खिलाड़ी ({{current}}/{{max}})',
        waitingForMore: 'और खिलाड़ियों का इंतजार...'
    },

    // Leaderboard
    leaderboard: {
        title: 'ग्लोबल लीडरबोर्ड',
        soloClassic: 'सोलो क्लासिक',
        soloExtreme: 'सोलो एक्सट्रीम',
        timed: 'टाइमड (3 मिनट)',
        competitive: 'प्रतिस्पर्धी',
        cooperative: 'सहयोगी',
        updated: '{{time}} को अपडेट हुआ',
        loading: 'लीडरबोर्ड लोड हो रहा है...',
        noScores: 'अभी कोई स्कोर नहीं। पहले बनें!',
        serverOffline: 'सर्वर ऑफलाइन - लीडरबोर्ड उपलब्ध नहीं। सर्वर शुरू हो रहा है या अस्थायी रूप से डाउन है।',
        loadFailed: 'लीडरबोर्ड लोड नहीं हुआ। कृपया फिर से कोशिश करें।',
        ranks: {
            first: 'पहला',
            second: 'दूसरा',
            third: 'तीसरा'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'भेड़',
        stamina: 'सहनशक्ति',
        time: 'समय',
        score: 'स्कोर',
        timeRemaining: 'शेष समय',
        complete: 'पूर्ण'
    },

    // Pause menu
    pause: {
        title: 'रुका हुआ',
        tapToResume: 'जारी रखने के लिए बाहर टैप करें',
        pressEscToResume: 'जारी रखने के लिए ESC दबाएं',
        resume: 'जारी रखें',
        restart: 'पुनः आरंभ',
        mainMenu: 'मुख्य मेनू',
        fullscreen: 'फुलस्क्रीन',
        exitFullscreen: 'फुलस्क्रीन से बाहर'
    },

    // Completion screen
    completion: {
        victory: 'जीत!',
        allSheepHerded: 'सभी {{count}} भेड़ें सफलतापूर्वक चराई गईं!',
        raceComplete: 'रेस पूर्ण',
        youWon: 'आप जीत गए!',
        playerWon: '{{name}} जीता!',
        timesUp: 'समय समाप्त',
        timesUpVictory: 'समय समाप्त - जीत!',
        youCollectedMost: 'आपने सबसे ज्यादा भेड़ें इकट्ठी कीं!',
        playerCollectedMost: '{{name}} ने सबसे ज्यादा इकट्ठी कीं!',
        teamVictory: 'टीम की जीत!',
        teamMessage: 'मिलकर काम करके, आपने सभी भेड़ें चराईं!',
        gameComplete: 'गेम पूर्ण',
        wellPlayed: 'अच्छा खेले!',
        newPersonalBest: 'नया पर्सनल बेस्ट!',
        finalStandings: 'अंतिम स्थिति',
        playAgain: 'फिर से खेलें',
        nextChallenge: 'अगली चुनौती',
        stats: {
            time: 'समय',
            yourScore: 'आपका स्कोर',
            raceTime: 'रेस समय',
            duration: 'अवधि',
            sheepCollected: 'भेड़ें इकट्ठी',
            teamTime: 'टीम समय'
        },
        sheepUnit: '{{count}} भेड़'
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'कुछ गलत हो गया',
        uiError: 'गेम UI में त्रुटि आई। पेज रिफ्रेश करें।',
        reloadPage: 'पेज रीलोड करें',
        errorDetails: 'त्रुटि विवरण',
        connectionFailed: 'मल्टीप्लेयर सर्वर से कनेक्ट नहीं हो पा रहा।',
        gameNotLoaded: 'गेम पूरी तरह लोड नहीं हुआ।',
        createRoomFailed: 'रूम बनाने में विफल।',
        joinRoomFailed: 'रूम जॉइन करने में विफल',
        noAvailableRooms: 'कोई रूम उपलब्ध नहीं',
        roomCodeLength: 'रूम कोड 6 अक्षरों का होना चाहिए'
    },

    // Welcome / Identity
    identity: {
        welcome: 'शीपडॉग सिम्युलेटर में स्वागत है!',
        chooseIdentity: 'चुनें कि आप कैसे जाने जाना चाहते हैं:',
        welcomeBack: 'वापसी पर स्वागत है, {{name}}!',
        confirmSelection: 'चयन की पुष्टि करें'
    }
};
