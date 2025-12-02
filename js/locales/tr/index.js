/**
 * Turkish Translations
 * Türkçe çeviri
 */

export default {
    // Common UI elements
    common: {
        back: 'Geri',
        backToMenu: '← Menüye Dön',
        start: 'Başla',
        cancel: 'İptal',
        confirm: 'Onayla',
        save: 'Kaydet',
        close: 'Kapat',
        loading: 'Yükleniyor...',
        error: 'Hata',
        retry: 'Tekrar Dene',
        refresh: 'Yenile',
        copy: 'Kopyala',
        copied: 'Kopyalandı!',
        you: 'Sen',
        host: 'Ev Sahibi',
        waiting: 'Bekleniyor...',
        players: 'Oyuncular',
        player: 'Oyuncu'
    },

    // Main menu / Mode selection
    menu: {
        title: 'Çoban Köpeği Simülatörü',
        soloPlay: 'Tek Oyunculu',
        soloPlayDesc: 'Kendi hızında sürü gütme pratiği yap',
        local2Player: 'Yerel 2 Oyunculu',
        local2PlayerDesc: 'Aynı ekranda işbirliği veya yarış',
        sandbox: 'Sandbox',
        sandboxDesc: 'Koyunları, çitleri ve kuralları özelleştir',
        multiplayer: 'Çok Oyunculu',
        multiplayerDesc: 'Çevrimiçi işbirliği veya yarış',
        leaderboard: 'Skor Tablosu',
        leaderboardDesc: 'Küresel sıralamaları görüntüle',
        settings: 'Ayarlar',
        settingsDesc: 'Oyun ayarlarını düzenle'
    },

    // Dog selection
    dogs: {
        title: 'Köpeğini Seç',
        stats: {
            speed: 'Hız',
            stamina: 'Dayanıklılık',
            control: 'Kontrol'
        },
        jep: {
            name: 'Jep',
            breed: 'Border Collie',
            description: 'İyi dayanıklılığa sahip dengeli çoban'
        },
        pip: {
            name: 'Pip',
            breed: 'Avustralya Çoban Köpeği',
            description: 'Hızlı ve çevik, hızlı sürü gütme için ideal'
        },
        sally: {
            name: 'Sally',
            breed: 'Welsh Corgi',
            description: 'Harika kontrol ama daha yavaş hareket'
        },
        shiloh: {
            name: 'Shiloh',
            breed: 'Alman Çoban Köpeği',
            description: 'Güçlü ve kararlı, mükemmel dayanıklılık'
        },
        georgeWashington: {
            name: 'George Washington',
            breed: 'Amerikan Foxhound',
            description: 'Dengeli yeteneklere sahip taktiksel çoban'
        }
    },

    // Game modes
    modes: {
        title: 'Oyun Modunu Seç',
        classic: 'Klasik Mod',
        classicDesc: 'Tüm 200 koyunu otlağa güt',
        extreme: 'Ekstrem Mod',
        extremeDesc: 'Tüm 1000 koyunu güt - performans meydan okuması!'
    },

    // Settings panel
    settings: {
        title: 'Ayarlar',
        performanceMode: 'Performans Modu',
        performanceOption: 'Performans - Maksimum FPS',
        balancedOption: 'Dengeli - Varsayılan ayarlar',
        qualityOption: 'Kalite - En iyi görseller',
        audioEnabled: 'Ses Açık',
        audioVolume: 'Ses Düzeyi',
        showStats: 'Performans İstatistiklerini Göster',
        resetDefaults: 'Varsayılanlara Sıfırla',
        language: 'Dil'
    },

    // Sandbox setup
    sandbox: {
        title: 'Sandbox Ayarları',
        sheepCount: 'Koyun Sayısı',
        numberOfSheep: 'Koyun sayısı',
        behavior: 'Davranış',
        movementSpeed: 'Hareket Hızı',
        flockCohesion: 'Sürü Bütünlüğü',
        separationDistance: 'Ayrılma Mesafesi',
        fieldSize: 'Alan Boyutu',
        fieldShape: 'Alan Şekli',
        fenceLayout: 'Çit Düzeni',
        editFenceLayout: 'Çit Düzenini Düzenle',
        editCustomShape: 'Özel Şekli Düzenle',
        drawCustomShape: 'Özel Şekil Çiz',
        timer: 'Zamanlayıcı',
        enableTimer: 'Zamanlayıcıyı Etkinleştir',
        countUp: 'Yukarı Say',
        countUpDesc: 'Zamanını takip et',
        countdown: 'Geri Sayım',
        countdownDesc: 'Zamanla yarış',
        timeLimit: 'Süre Limiti',
        winCondition: 'Kazanma Koşulu',
        herdAllSheep: 'Tüm Koyunları Güt',
        herdAllSheepDesc: 'Klasik tamamlama - tüm koyunlar otlağa',
        percentageGoal: 'Yüzde Hedefi',
        percentageGoalDesc: 'Hedef yüzdeye ulaşınca tamamla',
        targetPercentage: 'Hedef Yüzde',
        freePlay: 'Serbest Oyun',
        freePlayDesc: 'Kazanma koşulu yok - sadece oyna!',
        startGame: 'Oyunu Başlat',
        startGameWithCount: 'Oyunu Başlat ({{count}} koyun)',
        tabs: {
            sheep: 'Koyunlar',
            field: 'Alan',
            rules: 'Kurallar'
        },
        sizes: {
            small: 'Küçük',
            medium: 'Orta',
            large: 'Büyük',
            huge: 'Devasa'
        },
        shapes: {
            square: 'Kare',
            wide: 'Geniş',
            tall: 'Uzun',
            lShape: 'L-Şekli',
            circle: 'Daire',
            diamond: 'Elmas',
            triangle: 'Üçgen',
            custom: 'Özel'
        },
        fencePresets: {
            open: 'Açık Alan',
            openDesc: 'İç çit yok',
            corridor: 'Koridor',
            corridorDesc: 'Kapıya çitli yol',
            funnel: 'Huni',
            funnelDesc: 'Kapıya daralan yol',
            maze: 'Labirent',
            mazeDesc: 'Geçilecek engeller',
            obstacles: 'Engeller',
            obstaclesDesc: 'Rastgele çit engelleri',
            custom: 'Özel',
            customDesc: 'Kendi düzenini tasarla'
        }
    },

    // Local 2-player mode
    localMode: {
        title: 'Yerel 2 Oyunculu',
        coop: 'İşbirliği',
        coopDesc: 'Birlikte 200 koyun güt',
        versus: '1v1 Yarış',
        versusDesc: 'İlk 100 koyuna ulaşan kazanır!',
        timed: 'Zamanlı',
        timedDesc: '3 dakika - koyunlar yeniden doğar!',
        player: 'Oyuncu',
        controls1: 'WASD + Sol Shift',
        controls2: 'Oklar + Sağ Shift',
        startGame: 'Oyunu Başlat',
        noLeaderboards: 'Yerel mod skorları skor tablosuna gönderilmez'
    },

    // Fence editor
    fenceEditor: {
        title: 'Çit Düzeni',
        fenceCount: '{{count}} çit',
        fenceCountPlural: '{{count}} çit',
        quickLayouts: 'Hızlı Düzenler',
        tools: 'Araçlar',
        draw: 'Çiz',
        select: 'Seç',
        erase: 'Sil',
        pan: 'Kaydır',
        clearAll: 'Tümünü Temizle',
        done: 'Tamam',
        dogLabel: 'KÖPEK',
        sheepSpawn: 'Koyun Doğuş Noktası',
        helpDraw: 'Çit çizmek için tıkla ve sürükle - Izgara 10m',
        helpErase: 'Silmek için çite tıkla',
        helpPan: 'Kaydırmak için sürükle - Yakınlaştırmak için kaydır',
        helpSelect: 'Seçmek için çite tıkla',
        presets: {
            open: 'Boş alan',
            corridor: 'Yönlendirici yol',
            funnel: 'Daralan',
            maze: 'Engelleri geç',
            obstacles: 'Rastgele bloklar'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'Çok Oyunculu',
        createRoom: 'Oda Oluştur',
        createRoomDesc: 'Yeni oyun odası oluştur',
        joinRoom: 'Odaya Katıl',
        joinRoomDesc: 'Oda kodu gir',
        quickMatch: 'Hızlı Eşleşme',
        quickMatchDesc: 'Mevcut oyun bul',
        maxPlayers: 'Maks Oyuncu',
        playersCount: '{{count}} Oyuncu',
        gameMode: 'Oyun Modu',
        cooperative: 'İşbirlikçi',
        cooperativeDesc: 'Birlikte tüm koyunları ağıla güdün',
        competitive: 'Rekabetçi',
        competitiveDesc: 'Rakiplerden önce en çok koyunu topla',
        timed: 'Zamanlı (3 dk)',
        timedDesc: '3 dakikada mümkün olduğunca çok puan al',
        roomCode: 'Oda Kodu',
        enterRoomCode: 'Oda kodunu gir',
        leaveRoom: 'Odadan Ayrıl',
        startGame: 'Oyunu Başlat',
        waitingForPlayers: 'Oyuncular bekleniyor...'
    },

    // Lobby
    lobby: {
        title: 'Oyun Lobisi',
        roomCode: 'Oda Kodu',
        playersCount: 'Oyuncular ({{current}}/{{max}})',
        waitingForMore: 'Daha fazla oyuncu bekleniyor...'
    },

    // Leaderboard
    leaderboard: {
        title: 'Küresel Skor Tablosu',
        soloClassic: 'Solo Klasik',
        soloExtreme: 'Solo Ekstrem',
        timed: 'Zamanlı (3 dk)',
        competitive: 'Rekabetçi',
        cooperative: 'İşbirlikçi',
        updated: '{{time}} güncellendi',
        loading: 'Skor tablosu yükleniyor...',
        noScores: 'Henüz skor kaydedilmedi. İlk sen ol!',
        serverOffline: 'Sunucu çevrimdışı - Skor tablosu kullanılamıyor. Sunucu başlatılıyor veya geçici olarak kapalı olabilir.',
        loadFailed: 'Skor tablosu yüklenemedi. Lütfen tekrar deneyin.',
        ranks: {
            first: '1.',
            second: '2.',
            third: '3.'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'Koyun',
        stamina: 'Dayanıklılık',
        time: 'Süre',
        score: 'Skor',
        timeRemaining: 'Kalan Süre',
        complete: 'tamamlandı'
    },

    // Pause menu
    pause: {
        title: 'DURAKLATILDI',
        tapToResume: 'Devam etmek için dışarı dokun',
        pressEscToResume: 'Devam etmek için ESC bas',
        resume: 'Devam Et',
        restart: 'Yeniden Başlat',
        mainMenu: 'Ana Menü',
        fullscreen: 'Tam Ekran',
        exitFullscreen: 'Tam Ekrandan Çık'
    },

    // Completion screen
    completion: {
        victory: 'Zafer!',
        allSheepHerded: 'Tüm {{count}} koyun başarıyla güdüldü!',
        raceComplete: 'Yarış Tamamlandı',
        youWon: 'Kazandın!',
        playerWon: '{{name}} kazandı!',
        timesUp: 'Süre Doldu',
        timesUpVictory: 'Süre Doldu - Zafer!',
        youCollectedMost: 'En çok koyunu sen topladın!',
        playerCollectedMost: '{{name}} en çok topladı!',
        teamVictory: 'Takım Zaferi!',
        teamMessage: 'Birlikte çalışarak tüm koyunları güttünüz!',
        gameComplete: 'Oyun Tamamlandı',
        wellPlayed: 'İyi oynadın!',
        newPersonalBest: 'YENİ KİŞİSEL REKOR!',
        finalStandings: 'Final Sıralaması',
        playAgain: 'Tekrar Oyna',
        nextChallenge: 'Sonraki Meydan Okuma',
        stats: {
            time: 'Süre',
            yourScore: 'Skorun',
            raceTime: 'Yarış Süresi',
            duration: 'Süre',
            sheepCollected: 'Toplanan Koyun',
            teamTime: 'Takım Süresi'
        },
        sheepUnit: '{{count}} koyun'
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'Bir şeyler yanlış gitti',
        uiError: 'Oyun arayüzünde bir hata oluştu. Sayfayı yenilemeyi deneyin.',
        reloadPage: 'Sayfayı Yenile',
        errorDetails: 'Hata detayları',
        connectionFailed: 'Çok oyunculu sunucuya bağlanılamıyor.',
        gameNotLoaded: 'Oyun tam olarak yüklenmedi.',
        createRoomFailed: 'Oda oluşturulamadı.',
        joinRoomFailed: 'Odaya katılınamadı',
        noAvailableRooms: 'Mevcut oda yok',
        roomCodeLength: 'Oda kodu 6 karakter olmalıdır'
    },

    // Welcome / Identity
    identity: {
        welcome: 'Çoban Köpeği Simülatörüne Hoş Geldin!',
        chooseIdentity: 'Nasıl tanınmak istediğini seç:',
        welcomeBack: 'Tekrar hoş geldin, {{name}}!',
        confirmSelection: 'Seçimi Onayla'
    }
};
