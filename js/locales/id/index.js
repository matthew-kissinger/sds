/**
 * Indonesian Translations
 * Terjemahan Bahasa Indonesia
 */

export default {
    // Common UI elements
    common: {
        back: 'Kembali',
        backToMenu: '← Kembali ke Menu',
        start: 'Mulai',
        cancel: 'Batal',
        confirm: 'Konfirmasi',
        save: 'Simpan',
        close: 'Tutup',
        loading: 'Memuat...',
        error: 'Error',
        retry: 'Coba Lagi',
        refresh: 'Segarkan',
        copy: 'Salin',
        copied: 'Disalin!',
        you: 'Kamu',
        host: 'Host',
        waiting: 'Menunggu...',
        players: 'Pemain',
        player: 'Pemain'
    },

    // Main menu / Mode selection
    menu: {
        title: 'Simulator Anjing Gembala',
        soloPlay: 'Main Solo',
        soloPlayDesc: 'Latihan menggiring dengan kecepatanmu sendiri',
        local2Player: 'Lokal 2 Pemain',
        local2PlayerDesc: 'Kerja sama atau berkompetisi di satu layar',
        sandbox: 'Sandbox',
        sandboxDesc: 'Kustomisasi domba, pagar & aturan',
        multiplayer: 'Multiplayer',
        multiplayerDesc: 'Kerja sama atau berkompetisi online',
        leaderboard: 'Papan Peringkat',
        leaderboardDesc: 'Lihat peringkat global',
        settings: 'Pengaturan',
        settingsDesc: 'Atur pengaturan permainan'
    },

    // Dog selection
    dogs: {
        title: 'Pilih Anjingmu',
        stats: {
            speed: 'Kecepatan',
            stamina: 'Stamina',
            control: 'Kontrol'
        },
        jep: {
            name: 'Jep',
            breed: 'Border Collie',
            description: 'Penggembala seimbang dengan stamina bagus'
        },
        pip: {
            name: 'Pip',
            breed: 'Australian Shepherd',
            description: 'Cepat dan lincah, sempurna untuk menggiring cepat'
        },
        sally: {
            name: 'Sally',
            breed: 'Welsh Corgi',
            description: 'Kontrol bagus tapi gerakan lebih lambat'
        },
        shiloh: {
            name: 'Shiloh',
            breed: 'German Shepherd',
            description: 'Kuat dan stabil dengan daya tahan prima'
        },
        georgeWashington: {
            name: 'George Washington',
            breed: 'American Foxhound',
            description: 'Penggembala taktis dengan kemampuan seimbang'
        }
    },

    // Game modes
    modes: {
        title: 'Pilih Mode Permainan',
        classic: 'Mode Klasik',
        classicDesc: 'Giring semua 200 domba ke padang rumput',
        extreme: 'Mode Ekstrem',
        extremeDesc: 'Giring semua 1000 domba - tantangan performa!'
    },

    // Settings panel
    settings: {
        title: 'Pengaturan',
        performanceMode: 'Mode Performa',
        performanceOption: 'Performa - FPS Maksimum',
        balancedOption: 'Seimbang - Pengaturan default',
        qualityOption: 'Kualitas - Visual terbaik',
        audioEnabled: 'Audio Aktif',
        audioVolume: 'Volume Audio',
        showStats: 'Tampilkan Statistik Performa',
        resetDefaults: 'Reset ke Default',
        language: 'Bahasa'
    },

    // Sandbox setup
    sandbox: {
        title: 'Pengaturan Sandbox',
        sheepCount: 'Jumlah Domba',
        numberOfSheep: 'Jumlah domba',
        behavior: 'Perilaku',
        movementSpeed: 'Kecepatan Gerakan',
        flockCohesion: 'Kekompakan Kawanan',
        separationDistance: 'Jarak Pemisahan',
        fieldSize: 'Ukuran Lapangan',
        fieldShape: 'Bentuk Lapangan',
        fenceLayout: 'Tata Letak Pagar',
        editFenceLayout: 'Edit Tata Letak Pagar',
        editCustomShape: 'Edit Bentuk Kustom',
        drawCustomShape: 'Gambar Bentuk Kustom',
        timer: 'Timer',
        enableTimer: 'Aktifkan Timer',
        countUp: 'Hitung Naik',
        countUpDesc: 'Lacak waktumu',
        countdown: 'Hitung Mundur',
        countdownDesc: 'Balapan melawan waktu',
        timeLimit: 'Batas Waktu',
        winCondition: 'Syarat Menang',
        herdAllSheep: 'Giring Semua Domba',
        herdAllSheepDesc: 'Penyelesaian klasik - semua domba ke padang rumput',
        percentageGoal: 'Target Persentase',
        percentageGoalDesc: 'Selesai saat mencapai persentase target',
        targetPercentage: 'Persentase Target',
        freePlay: 'Main Bebas',
        freePlayDesc: 'Tanpa syarat menang - main saja!',
        startGame: 'Mulai Permainan',
        startGameWithCount: 'Mulai Permainan ({{count}} domba)',
        tabs: {
            sheep: 'Domba',
            field: 'Lapangan',
            rules: 'Aturan'
        },
        sizes: {
            small: 'Kecil',
            medium: 'Sedang',
            large: 'Besar',
            huge: 'Sangat Besar'
        },
        shapes: {
            square: 'Persegi',
            wide: 'Lebar',
            tall: 'Tinggi',
            lShape: 'Bentuk L',
            circle: 'Lingkaran',
            diamond: 'Berlian',
            triangle: 'Segitiga',
            custom: 'Kustom'
        },
        fencePresets: {
            open: 'Lapangan Terbuka',
            openDesc: 'Tanpa pagar internal',
            corridor: 'Koridor',
            corridorDesc: 'Jalur berpagar ke gerbang',
            funnel: 'Corong',
            funnelDesc: 'Jalur menyempit ke gerbang',
            maze: 'Labirin',
            mazeDesc: 'Hambatan untuk dinavigasi',
            obstacles: 'Hambatan',
            obstaclesDesc: 'Hambatan pagar acak',
            custom: 'Kustom',
            customDesc: 'Desain tata letakmu sendiri'
        }
    },

    // Local 2-player mode
    localMode: {
        title: 'Lokal 2 Pemain',
        coop: 'Ko-op',
        coopDesc: 'Bekerja sama menggiring 200 domba',
        versus: 'Balapan 1v1',
        versusDesc: 'Pertama ke 100 domba menang!',
        timed: 'Berwaktu',
        timedDesc: '3 menit - domba respawn!',
        player: 'Pemain',
        controls1: 'WASD + Shift Kiri',
        controls2: 'Panah + Shift Kanan',
        startGame: 'Mulai Permainan',
        noLeaderboards: 'Skor di mode lokal tidak dikirim ke papan peringkat'
    },

    // Fence editor
    fenceEditor: {
        title: 'Tata Letak Pagar',
        fenceCount: '{{count}} pagar',
        fenceCountPlural: '{{count}} pagar',
        quickLayouts: 'Tata Letak Cepat',
        tools: 'Alat',
        draw: 'Gambar',
        select: 'Pilih',
        erase: 'Hapus',
        pan: 'Geser',
        clearAll: 'Hapus Semua',
        done: 'Selesai',
        dogLabel: 'ANJING',
        sheepSpawn: 'Titik Spawn Domba',
        helpDraw: 'Klik dan seret untuk menggambar pagar - Grid 10m',
        helpErase: 'Klik pagar untuk menghapus',
        helpPan: 'Seret untuk menggeser - Scroll untuk zoom',
        helpSelect: 'Klik pagar untuk memilih',
        presets: {
            open: 'Lapangan kosong',
            corridor: 'Jalur terpandu',
            funnel: 'Menyempit',
            maze: 'Navigasi hambatan',
            obstacles: 'Blok acak'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'Multiplayer',
        createRoom: 'Buat Ruangan',
        createRoomDesc: 'Host ruangan permainan baru',
        joinRoom: 'Gabung Ruangan',
        joinRoomDesc: 'Masukkan kode ruangan',
        quickMatch: 'Pertandingan Cepat',
        quickMatchDesc: 'Temukan permainan yang tersedia',
        maxPlayers: 'Maks Pemain',
        playersCount: '{{count}} Pemain',
        gameMode: 'Mode Permainan',
        cooperative: 'Kooperatif',
        cooperativeDesc: 'Bekerja sama menggiring semua domba ke kandang',
        competitive: 'Kompetitif',
        competitiveDesc: 'Balapan mengumpulkan domba terbanyak',
        timed: 'Berwaktu (3 mnt)',
        timedDesc: 'Cetak poin sebanyak mungkin dalam 3 menit',
        roomCode: 'Kode Ruangan',
        enterRoomCode: 'Masukkan kode ruangan',
        leaveRoom: 'Keluar Ruangan',
        startGame: 'Mulai Permainan',
        waitingForPlayers: 'Menunggu pemain...'
    },

    // Lobby
    lobby: {
        title: 'Lobi Permainan',
        roomCode: 'Kode Ruangan',
        playersCount: 'Pemain ({{current}}/{{max}})',
        waitingForMore: 'Menunggu pemain lain...'
    },

    // Leaderboard
    leaderboard: {
        title: 'Papan Peringkat Global',
        soloClassic: 'Solo Klasik',
        soloExtreme: 'Solo Ekstrem',
        timed: 'Berwaktu (3 mnt)',
        competitive: 'Kompetitif',
        cooperative: 'Kooperatif',
        updated: 'Diperbarui {{time}}',
        loading: 'Memuat papan peringkat...',
        noScores: 'Belum ada skor tercatat. Jadilah yang pertama!',
        serverOffline: 'Server offline - Papan peringkat tidak tersedia. Server mungkin sedang memulai atau tidak aktif sementara.',
        loadFailed: 'Gagal memuat papan peringkat. Silakan coba lagi.',
        ranks: {
            first: '1',
            second: '2',
            third: '3'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'Domba',
        stamina: 'Stamina',
        time: 'Waktu',
        score: 'Skor',
        timeRemaining: 'Waktu Tersisa',
        complete: 'selesai'
    },

    // Pause menu
    pause: {
        title: 'DIJEDA',
        tapToResume: 'Ketuk di luar untuk melanjutkan',
        pressEscToResume: 'Tekan ESC untuk melanjutkan',
        resume: 'Lanjutkan',
        restart: 'Mulai Ulang',
        mainMenu: 'Menu Utama',
        fullscreen: 'Layar Penuh',
        exitFullscreen: 'Keluar Layar Penuh'
    },

    // Completion screen
    completion: {
        victory: 'Menang!',
        allSheepHerded: 'Semua {{count}} domba berhasil digiring!',
        raceComplete: 'Balapan Selesai',
        youWon: 'Kamu menang!',
        playerWon: '{{name}} menang!',
        timesUp: 'Waktu Habis',
        timesUpVictory: 'Waktu Habis - Menang!',
        youCollectedMost: 'Kamu mengumpulkan domba terbanyak!',
        playerCollectedMost: '{{name}} mengumpulkan terbanyak!',
        teamVictory: 'Kemenangan Tim!',
        teamMessage: 'Bekerja sama, kalian menggiring semua domba!',
        gameComplete: 'Permainan Selesai',
        wellPlayed: 'Bagus!',
        newPersonalBest: 'REKOR PRIBADI BARU!',
        finalStandings: 'Peringkat Akhir',
        playAgain: 'Main Lagi',
        nextChallenge: 'Tantangan Berikutnya',
        stats: {
            time: 'Waktu',
            yourScore: 'Skormu',
            raceTime: 'Waktu Balapan',
            duration: 'Durasi',
            sheepCollected: 'Domba Dikumpulkan',
            teamTime: 'Waktu Tim'
        },
        sheepUnit: '{{count}} domba'
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'Terjadi kesalahan',
        uiError: 'UI permainan mengalami error. Coba segarkan halaman.',
        reloadPage: 'Muat Ulang Halaman',
        errorDetails: 'Detail error',
        connectionFailed: 'Tidak dapat terhubung ke server multiplayer.',
        gameNotLoaded: 'Permainan belum sepenuhnya dimuat.',
        createRoomFailed: 'Gagal membuat ruangan.',
        joinRoomFailed: 'Gagal bergabung ke ruangan',
        noAvailableRooms: 'Tidak ada ruangan tersedia',
        roomCodeLength: 'Kode ruangan harus 6 karakter'
    },

    // Welcome / Identity
    identity: {
        welcome: 'Selamat datang di Simulator Anjing Gembala!',
        chooseIdentity: 'Pilih cara kamu ingin dikenal:',
        welcomeBack: 'Selamat datang kembali, {{name}}!',
        confirmSelection: 'Konfirmasi Pilihan'
    }
};
