/**
 * Arabic Translations
 * الترجمة العربية
 * Note: Arabic is RTL (right-to-left)
 */

export default {
    // Common UI elements
    common: {
        back: 'رجوع',
        backToMenu: 'العودة للقائمة ←',
        start: 'ابدأ',
        cancel: 'إلغاء',
        confirm: 'تأكيد',
        save: 'حفظ',
        close: 'إغلاق',
        loading: 'جاري التحميل...',
        error: 'خطأ',
        retry: 'حاول مجدداً',
        refresh: 'تحديث',
        copy: 'نسخ',
        copied: 'تم النسخ!',
        you: 'أنت',
        host: 'المضيف',
        waiting: 'في الانتظار...',
        players: 'اللاعبون',
        player: 'لاعب'
    },

    // Main menu / Mode selection
    menu: {
        title: 'محاكي كلب الراعي',
        soloPlay: 'اللعب الفردي',
        soloPlayDesc: 'تدرب على الرعي بسرعتك الخاصة',
        local2Player: 'لاعبان محلياً',
        local2PlayerDesc: 'تعاون أو تنافس على شاشة واحدة',
        sandbox: 'وضع حر',
        sandboxDesc: 'خصص الأغنام والأسوار والقواعد',
        multiplayer: 'متعدد اللاعبين',
        multiplayerDesc: 'تعاون أو تنافس عبر الإنترنت',
        leaderboard: 'لوحة المتصدرين',
        leaderboardDesc: 'عرض التصنيفات العالمية',
        settings: 'الإعدادات',
        settingsDesc: 'ضبط إعدادات اللعبة'
    },

    // Dog selection
    dogs: {
        title: 'اختر كلبك',
        stats: {
            speed: 'السرعة',
            stamina: 'التحمل',
            control: 'التحكم'
        },
        jep: {
            name: 'جيب',
            breed: 'بوردر كولي',
            description: 'راعي متوازن مع تحمل جيد'
        },
        pip: {
            name: 'بيب',
            breed: 'الراعي الأسترالي',
            description: 'سريع ورشيق، مثالي للرعي السريع'
        },
        sally: {
            name: 'سالي',
            breed: 'ويلش كورجي',
            description: 'تحكم ممتاز لكن حركة أبطأ'
        },
        shiloh: {
            name: 'شيلو',
            breed: 'الراعي الألماني',
            description: 'قوي وثابت مع تحمل ممتاز'
        },
        georgeWashington: {
            name: 'جورج واشنطن',
            breed: 'أمريكان فوكسهاوند',
            description: 'راعي تكتيكي بقدرات متوازنة'
        }
    },

    // Game modes
    modes: {
        title: 'اختر وضع اللعب',
        classic: 'الوضع الكلاسيكي',
        classicDesc: 'ارعَ جميع الـ 200 خروف إلى المرعى',
        extreme: 'الوضع المتطرف',
        extremeDesc: 'ارعَ جميع الـ 1000 خروف - تحدي الأداء!'
    },

    // Settings panel
    settings: {
        title: 'الإعدادات',
        performanceMode: 'وضع الأداء',
        performanceOption: 'أداء - أقصى معدل إطارات',
        balancedOption: 'متوازن - الإعدادات الافتراضية',
        qualityOption: 'جودة - أفضل رسومات',
        audioEnabled: 'الصوت مفعل',
        audioVolume: 'مستوى الصوت',
        showStats: 'عرض إحصائيات الأداء',
        resetDefaults: 'استعادة الافتراضي',
        language: 'اللغة'
    },

    // Sandbox setup
    sandbox: {
        title: 'إعداد الوضع الحر',
        sheepCount: 'عدد الأغنام',
        numberOfSheep: 'عدد الأغنام',
        behavior: 'السلوك',
        movementSpeed: 'سرعة الحركة',
        flockCohesion: 'تماسك القطيع',
        separationDistance: 'مسافة الفصل',
        fieldSize: 'حجم الحقل',
        fieldShape: 'شكل الحقل',
        fenceLayout: 'تخطيط الأسوار',
        editFenceLayout: 'تعديل تخطيط الأسوار',
        editCustomShape: 'تعديل الشكل المخصص',
        drawCustomShape: 'رسم شكل مخصص',
        timer: 'المؤقت',
        enableTimer: 'تفعيل المؤقت',
        countUp: 'العد التصاعدي',
        countUpDesc: 'تتبع وقتك',
        countdown: 'العد التنازلي',
        countdownDesc: 'سباق مع الزمن',
        timeLimit: 'الحد الزمني',
        winCondition: 'شرط الفوز',
        herdAllSheep: 'رعي جميع الأغنام',
        herdAllSheepDesc: 'الإكمال الكلاسيكي - جميع الأغنام للمرعى',
        percentageGoal: 'هدف النسبة المئوية',
        percentageGoalDesc: 'أكمل عند الوصول للنسبة المستهدفة',
        targetPercentage: 'النسبة المستهدفة',
        freePlay: 'اللعب الحر',
        freePlayDesc: 'بدون شرط فوز - فقط العب!',
        startGame: 'ابدأ اللعبة',
        startGameWithCount: 'ابدأ اللعبة ({{count}} خروف)',
        tabs: {
            sheep: 'الأغنام',
            field: 'الحقل',
            rules: 'القواعد'
        },
        sizes: {
            small: 'صغير',
            medium: 'متوسط',
            large: 'كبير',
            huge: 'ضخم'
        },
        shapes: {
            square: 'مربع',
            wide: 'عريض',
            tall: 'طويل',
            lShape: 'شكل L',
            circle: 'دائرة',
            diamond: 'معين',
            triangle: 'مثلث',
            custom: 'مخصص'
        },
        fencePresets: {
            open: 'حقل مفتوح',
            openDesc: 'بدون أسوار داخلية',
            corridor: 'ممر',
            corridorDesc: 'مسار مسور للبوابة',
            funnel: 'قمع',
            funnelDesc: 'مسار يضيق نحو البوابة',
            maze: 'متاهة',
            mazeDesc: 'عوائق للتنقل حولها',
            obstacles: 'عوائق',
            obstaclesDesc: 'عوائق أسوار عشوائية',
            custom: 'مخصص',
            customDesc: 'صمم تخطيطك الخاص'
        }
    },

    // Local 2-player mode
    localMode: {
        title: 'لاعبان محلياً',
        coop: 'تعاوني',
        coopDesc: 'اعملوا معاً لرعي 200 خروف',
        versus: 'سباق 1ضد1',
        versusDesc: 'أول من يصل لـ 100 خروف يفوز!',
        timed: 'بوقت محدد',
        timedDesc: '3 دقائق - الأغنام تعود!',
        player: 'لاعب',
        controls1: 'WASD + Shift الأيسر',
        controls2: 'الأسهم + Shift الأيمن',
        startGame: 'ابدأ اللعبة',
        noLeaderboards: 'النتائج في الوضع المحلي لا تُرسل للوحة المتصدرين'
    },

    // Fence editor
    fenceEditor: {
        title: 'تخطيط الأسوار',
        fenceCount: '{{count}} سور',
        fenceCountPlural: '{{count}} أسوار',
        quickLayouts: 'تخطيطات سريعة',
        tools: 'الأدوات',
        draw: 'رسم',
        select: 'اختيار',
        erase: 'مسح',
        pan: 'تحريك',
        clearAll: 'مسح الكل',
        done: 'تم',
        dogLabel: 'الكلب',
        sheepSpawn: 'نقطة ظهور الأغنام',
        helpDraw: 'انقر واسحب لرسم الأسوار - الشبكة 10م',
        helpErase: 'انقر على سور لحذفه',
        helpPan: 'اسحب للتحريك - مرر للتكبير',
        helpSelect: 'انقر على سور لتحديده',
        presets: {
            open: 'حقل فارغ',
            corridor: 'مسار موجه',
            funnel: 'تضييق',
            maze: 'تجاوز العوائق',
            obstacles: 'كتل عشوائية'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'متعدد اللاعبين',
        createRoom: 'إنشاء غرفة',
        createRoomDesc: 'استضف غرفة لعب جديدة',
        joinRoom: 'انضم لغرفة',
        joinRoomDesc: 'أدخل رمز الغرفة',
        quickMatch: 'مباراة سريعة',
        quickMatchDesc: 'ابحث عن لعبة متاحة',
        maxPlayers: 'أقصى عدد لاعبين',
        playersCount: '{{count}} لاعبين',
        gameMode: 'وضع اللعب',
        cooperative: 'تعاوني',
        cooperativeDesc: 'اعملوا معاً لرعي جميع الأغنام للحظيرة',
        competitive: 'تنافسي',
        competitiveDesc: 'تسابق لجمع أكثر عدد من الأغنام',
        timed: 'بوقت (3 د)',
        timedDesc: 'سجل أكبر عدد من النقاط في 3 دقائق',
        roomCode: 'رمز الغرفة',
        enterRoomCode: 'أدخل رمز الغرفة',
        leaveRoom: 'غادر الغرفة',
        startGame: 'ابدأ اللعبة',
        waitingForPlayers: 'في انتظار اللاعبين...'
    },

    // Lobby
    lobby: {
        title: 'ردهة اللعبة',
        roomCode: 'رمز الغرفة',
        playersCount: 'اللاعبون ({{current}}/{{max}})',
        waitingForMore: 'في انتظار المزيد من اللاعبين...'
    },

    // Leaderboard
    leaderboard: {
        title: 'لوحة المتصدرين العالمية',
        soloClassic: 'فردي كلاسيكي',
        soloExtreme: 'فردي متطرف',
        timed: 'بوقت (3 د)',
        competitive: 'تنافسي',
        cooperative: 'تعاوني',
        updated: 'تم التحديث {{time}}',
        loading: 'جاري تحميل لوحة المتصدرين...',
        noScores: 'لا توجد نتائج بعد. كن الأول!',
        serverOffline: 'الخادم غير متصل - لوحة المتصدرين غير متاحة. قد يكون الخادم قيد التشغيل أو معطل مؤقتاً.',
        loadFailed: 'فشل تحميل لوحة المتصدرين. حاول مجدداً.',
        ranks: {
            first: 'الأول',
            second: 'الثاني',
            third: 'الثالث'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'الأغنام',
        stamina: 'التحمل',
        time: 'الوقت',
        score: 'النقاط',
        timeRemaining: 'الوقت المتبقي',
        complete: 'مكتمل'
    },

    // Pause menu
    pause: {
        title: 'إيقاف مؤقت',
        tapToResume: 'انقر خارجاً للمتابعة',
        pressEscToResume: 'اضغط ESC للمتابعة',
        resume: 'متابعة',
        restart: 'إعادة البدء',
        mainMenu: 'القائمة الرئيسية',
        fullscreen: 'ملء الشاشة',
        exitFullscreen: 'الخروج من ملء الشاشة'
    },

    // Completion screen
    completion: {
        victory: 'فوز!',
        allSheepHerded: 'تم رعي جميع الـ {{count}} خروف بنجاح!',
        raceComplete: 'انتهى السباق',
        youWon: 'فزت!',
        playerWon: '{{name}} فاز!',
        timesUp: 'انتهى الوقت',
        timesUpVictory: 'انتهى الوقت - فوز!',
        youCollectedMost: 'جمعت أكثر عدد من الأغنام!',
        playerCollectedMost: '{{name}} جمع الأكثر!',
        teamVictory: 'فوز الفريق!',
        teamMessage: 'بالعمل معاً، رعيتم جميع الأغنام!',
        gameComplete: 'انتهت اللعبة',
        wellPlayed: 'أحسنت اللعب!',
        newPersonalBest: 'رقم قياسي شخصي جديد!',
        finalStandings: 'الترتيب النهائي',
        playAgain: 'العب مجدداً',
        nextChallenge: 'التحدي التالي',
        stats: {
            time: 'الوقت',
            yourScore: 'نقاطك',
            raceTime: 'وقت السباق',
            duration: 'المدة',
            sheepCollected: 'الأغنام المجموعة',
            teamTime: 'وقت الفريق'
        },
        sheepUnit: '{{count}} خروف'
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'حدث خطأ ما',
        uiError: 'واجهت واجهة اللعبة خطأ. حاول تحديث الصفحة.',
        reloadPage: 'إعادة تحميل الصفحة',
        errorDetails: 'تفاصيل الخطأ',
        connectionFailed: 'تعذر الاتصال بخادم متعدد اللاعبين.',
        gameNotLoaded: 'اللعبة لم يتم تحميلها بالكامل.',
        createRoomFailed: 'فشل إنشاء الغرفة.',
        joinRoomFailed: 'فشل الانضمام للغرفة',
        noAvailableRooms: 'لا توجد غرف متاحة',
        roomCodeLength: 'رمز الغرفة يجب أن يكون 6 أحرف'
    },

    // Welcome / Identity
    identity: {
        welcome: 'مرحباً في محاكي كلب الراعي!',
        chooseIdentity: 'اختر كيف تريد أن تُعرف:',
        welcomeBack: 'مرحباً بعودتك، {{name}}!',
        confirmSelection: 'تأكيد الاختيار'
    }
};
