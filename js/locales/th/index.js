/**
 * Thai Translations
 * การแปลภาษาไทย
 */

export default {
    // Common UI elements
    common: {
        back: 'กลับ',
        backToMenu: '← กลับเมนู',
        start: 'เริ่ม',
        cancel: 'ยกเลิก',
        confirm: 'ยืนยัน',
        save: 'บันทึก',
        close: 'ปิด',
        loading: 'กำลังโหลด...',
        error: 'ข้อผิดพลาด',
        retry: 'ลองอีกครั้ง',
        refresh: 'รีเฟรช',
        copy: 'คัดลอก',
        copied: 'คัดลอกแล้ว!',
        you: 'คุณ',
        host: 'โฮสต์',
        waiting: 'รอ...',
        players: 'ผู้เล่น',
        player: 'ผู้เล่น'
    },

    // Main menu / Mode selection
    menu: {
        title: 'จำลองสุนัขต้อนแกะ',
        soloPlay: 'เล่นคนเดียว',
        soloPlayDesc: 'ฝึกต้อนแกะตามจังหวะของคุณ',
        local2Player: '2 ผู้เล่นท้องถิ่น',
        local2PlayerDesc: 'ร่วมมือหรือแข่งขันบนจอเดียว',
        sandbox: 'แซนด์บ็อกซ์',
        sandboxDesc: 'ปรับแต่งแกะ รั้ว และกฎ',
        multiplayer: 'ผู้เล่นหลายคน',
        multiplayerDesc: 'ร่วมมือหรือแข่งขันออนไลน์',
        leaderboard: 'กระดานผู้นำ',
        leaderboardDesc: 'ดูอันดับโลก',
        settings: 'การตั้งค่า',
        settingsDesc: 'ปรับการตั้งค่าเกม'
    },

    // Dog selection
    dogs: {
        title: 'เลือกสุนัขของคุณ',
        stats: {
            speed: 'ความเร็ว',
            stamina: 'ความอดทน',
            control: 'การควบคุม'
        },
        jep: {
            name: 'เจป',
            breed: 'บอร์เดอร์ คอลลี่',
            description: 'สุนัขต้อนที่สมดุลมีความอดทนดี'
        },
        pip: {
            name: 'พิป',
            breed: 'ออสเตรเลียน เชพเพิร์ด',
            description: 'เร็วและคล่องแคล่ว เหมาะกับการต้อนเร็ว'
        },
        sally: {
            name: 'แซลลี่',
            breed: 'เวลช์ คอร์กี้',
            description: 'ควบคุมได้ดีแต่เคลื่อนที่ช้ากว่า'
        },
        shiloh: {
            name: 'ไชโล',
            breed: 'เยอรมัน เชพเพิร์ด',
            description: 'แข็งแกร่งและมั่นคงมีความทนทานยอดเยี่ยม'
        },
        georgeWashington: {
            name: 'จอร์จ วอชิงตัน',
            breed: 'อเมริกัน ฟ็อกซ์ฮาวนด์',
            description: 'สุนัขต้อนเชิงยุทธวิธีมีความสามารถสมดุล'
        }
    },

    // Game modes
    modes: {
        title: 'เลือกโหมดเกม',
        classic: 'โหมดคลาสสิก',
        classicDesc: 'ต้อนแกะ 200 ตัวไปทุ่งหญ้า',
        extreme: 'โหมดสุดขีด',
        extremeDesc: 'ต้อนแกะ 1000 ตัว - ท้าทายประสิทธิภาพ!'
    },

    // Settings panel
    settings: {
        title: 'การตั้งค่า',
        performanceMode: 'โหมดประสิทธิภาพ',
        performanceOption: 'ประสิทธิภาพ - FPS สูงสุด',
        balancedOption: 'สมดุล - ค่าเริ่มต้น',
        qualityOption: 'คุณภาพ - ภาพดีที่สุด',
        audioEnabled: 'เปิดเสียง',
        audioVolume: 'ระดับเสียง',
        showStats: 'แสดงสถิติประสิทธิภาพ',
        resetDefaults: 'รีเซ็ตเป็นค่าเริ่มต้น',
        language: 'ภาษา'
    },

    // Sandbox setup
    sandbox: {
        title: 'ตั้งค่าแซนด์บ็อกซ์',
        sheepCount: 'จำนวนแกะ',
        numberOfSheep: 'จำนวนแกะ',
        behavior: 'พฤติกรรม',
        movementSpeed: 'ความเร็วการเคลื่อนที่',
        flockCohesion: 'ความเป็นฝูง',
        separationDistance: 'ระยะห่าง',
        fieldSize: 'ขนาดสนาม',
        fieldShape: 'รูปร่างสนาม',
        fenceLayout: 'รูปแบบรั้ว',
        editFenceLayout: 'แก้ไขรูปแบบรั้ว',
        editCustomShape: 'แก้ไขรูปร่างกำหนดเอง',
        drawCustomShape: 'วาดรูปร่างกำหนดเอง',
        timer: 'ตัวจับเวลา',
        enableTimer: 'เปิดตัวจับเวลา',
        countUp: 'นับขึ้น',
        countUpDesc: 'ติดตามเวลาของคุณ',
        countdown: 'นับถอยหลัง',
        countdownDesc: 'แข่งกับเวลา',
        timeLimit: 'จำกัดเวลา',
        winCondition: 'เงื่อนไขชนะ',
        herdAllSheep: 'ต้อนแกะทั้งหมด',
        herdAllSheepDesc: 'ความสำเร็จคลาสสิก - แกะทั้งหมดไปทุ่งหญ้า',
        percentageGoal: 'เป้าหมายเปอร์เซ็นต์',
        percentageGoalDesc: 'สำเร็จเมื่อถึงเปอร์เซ็นต์เป้าหมาย',
        targetPercentage: 'เปอร์เซ็นต์เป้าหมาย',
        freePlay: 'เล่นอิสระ',
        freePlayDesc: 'ไม่มีเงื่อนไข - เล่นเลย!',
        startGame: 'เริ่มเกม',
        startGameWithCount: 'เริ่มเกม ({{count}} ตัว)',
        tabs: {
            sheep: 'แกะ',
            field: 'สนาม',
            rules: 'กฎ'
        },
        sizes: {
            small: 'เล็ก',
            medium: 'กลาง',
            large: 'ใหญ่',
            huge: 'ใหญ่มาก'
        },
        shapes: {
            square: 'สี่เหลี่ยม',
            wide: 'กว้าง',
            tall: 'สูง',
            lShape: 'รูปตัว L',
            circle: 'วงกลม',
            diamond: 'เพชร',
            triangle: 'สามเหลี่ยม',
            custom: 'กำหนดเอง'
        },
        fencePresets: {
            open: 'สนามเปิด',
            openDesc: 'ไม่มีรั้วด้านใน',
            corridor: 'ทางเดิน',
            corridorDesc: 'เส้นทางมีรั้วไปประตู',
            funnel: 'กรวย',
            funnelDesc: 'เส้นทางแคบลงไปประตู',
            maze: 'เขาวงกต',
            mazeDesc: 'อุปสรรคที่ต้องผ่าน',
            obstacles: 'อุปสรรค',
            obstaclesDesc: 'อุปสรรครั้วสุ่ม',
            custom: 'กำหนดเอง',
            customDesc: 'ออกแบบรูปแบบของคุณ'
        }
    },

    // Local 2-player mode
    localMode: {
        title: '2 ผู้เล่นท้องถิ่น',
        coop: 'ร่วมมือ',
        coopDesc: 'ทำงานร่วมกันต้อนแกะ 200 ตัว',
        versus: 'แข่ง 1v1',
        versusDesc: 'คนแรกถึง 100 ตัวชนะ!',
        timed: 'จับเวลา',
        timedDesc: '3 นาที - แกะเกิดใหม่!',
        player: 'ผู้เล่น',
        controls1: 'WASD + Shift ซ้าย',
        controls2: 'ลูกศร + Shift ขวา',
        startGame: 'เริ่มเกม',
        noLeaderboards: 'คะแนนโหมดท้องถิ่นไม่ส่งไปกระดานผู้นำ'
    },

    // Fence editor
    fenceEditor: {
        title: 'รูปแบบรั้ว',
        fenceCount: '{{count}} รั้ว',
        fenceCountPlural: '{{count}} รั้ว',
        quickLayouts: 'รูปแบบด่วน',
        tools: 'เครื่องมือ',
        draw: 'วาด',
        select: 'เลือก',
        erase: 'ลบ',
        pan: 'เลื่อน',
        clearAll: 'ล้างทั้งหมด',
        done: 'เสร็จ',
        dogLabel: 'สุนัข',
        sheepSpawn: 'จุดเกิดแกะ',
        helpDraw: 'คลิกและลากเพื่อวาดรั้ว - กริด 10ม.',
        helpErase: 'คลิกรั้วเพื่อลบ',
        helpPan: 'ลากเพื่อเลื่อน - เลื่อนเพื่อซูม',
        helpSelect: 'คลิกรั้วเพื่อเลือก',
        presets: {
            open: 'สนามว่าง',
            corridor: 'ทางนำ',
            funnel: 'แคบลง',
            maze: 'ผ่านอุปสรรค',
            obstacles: 'บล็อกสุ่ม'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'ผู้เล่นหลายคน',
        createRoom: 'สร้างห้อง',
        createRoomDesc: 'โฮสต์ห้องเกมใหม่',
        joinRoom: 'เข้าร่วมห้อง',
        joinRoomDesc: 'ใส่รหัสห้อง',
        quickMatch: 'แมตช์ด่วน',
        quickMatchDesc: 'หาเกมที่มี',
        maxPlayers: 'ผู้เล่นสูงสุด',
        playersCount: '{{count}} ผู้เล่น',
        gameMode: 'โหมดเกม',
        cooperative: 'ร่วมมือ',
        cooperativeDesc: 'ทำงานร่วมกันต้อนแกะทั้งหมดเข้าคอก',
        competitive: 'แข่งขัน',
        competitiveDesc: 'แข่งเก็บแกะมากที่สุด',
        timed: 'จับเวลา (3 นาที)',
        timedDesc: 'ทำคะแนนให้มากที่สุดใน 3 นาที',
        roomCode: 'รหัสห้อง',
        enterRoomCode: 'ใส่รหัสห้อง',
        leaveRoom: 'ออกจากห้อง',
        startGame: 'เริ่มเกม',
        waitingForPlayers: 'รอผู้เล่น...'
    },

    // Lobby
    lobby: {
        title: 'ล็อบบี้เกม',
        roomCode: 'รหัสห้อง',
        playersCount: 'ผู้เล่น ({{current}}/{{max}})',
        waitingForMore: 'รอผู้เล่นเพิ่ม...'
    },

    // Leaderboard
    leaderboard: {
        title: 'กระดานผู้นำโลก',
        soloClassic: 'เดี่ยวคลาสสิก',
        soloExtreme: 'เดี่ยวสุดขีด',
        timed: 'จับเวลา (3 นาที)',
        competitive: 'แข่งขัน',
        cooperative: 'ร่วมมือ',
        updated: 'อัปเดต {{time}}',
        loading: 'กำลังโหลดกระดานผู้นำ...',
        noScores: 'ยังไม่มีคะแนน เป็นคนแรก!',
        serverOffline: 'เซิร์ฟเวอร์ออฟไลน์ - กระดานผู้นำไม่พร้อม เซิร์ฟเวอร์อาจกำลังเริ่มหรือปิดชั่วคราว',
        loadFailed: 'โหลดกระดานผู้นำไม่สำเร็จ ลองอีกครั้ง',
        ranks: {
            first: 'ที่ 1',
            second: 'ที่ 2',
            third: 'ที่ 3'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'แกะ',
        stamina: 'ความอดทน',
        time: 'เวลา',
        score: 'คะแนน',
        timeRemaining: 'เวลาที่เหลือ',
        complete: 'สำเร็จ'
    },

    // Pause menu
    pause: {
        title: 'พัก',
        tapToResume: 'แตะข้างนอกเพื่อเล่นต่อ',
        pressEscToResume: 'กด ESC เพื่อเล่นต่อ',
        resume: 'เล่นต่อ',
        restart: 'เริ่มใหม่',
        mainMenu: 'เมนูหลัก',
        fullscreen: 'เต็มจอ',
        exitFullscreen: 'ออกจากเต็มจอ'
    },

    // Completion screen
    completion: {
        victory: 'ชนะ!',
        allSheepHerded: 'ต้อนแกะ {{count}} ตัวสำเร็จ!',
        raceComplete: 'แข่งเสร็จ',
        youWon: 'คุณชนะ!',
        playerWon: '{{name}} ชนะ!',
        timesUp: 'หมดเวลา',
        timesUpVictory: 'หมดเวลา - ชนะ!',
        youCollectedMost: 'คุณเก็บแกะมากที่สุด!',
        playerCollectedMost: '{{name}} เก็บมากที่สุด!',
        teamVictory: 'ทีมชนะ!',
        teamMessage: 'ร่วมมือกัน ต้อนแกะทั้งหมดได้!',
        gameComplete: 'เกมเสร็จ',
        wellPlayed: 'เล่นได้ดี!',
        newPersonalBest: 'สถิติส่วนตัวใหม่!',
        finalStandings: 'อันดับสุดท้าย',
        playAgain: 'เล่นอีก',
        nextChallenge: 'ท้าทายต่อไป',
        stats: {
            time: 'เวลา',
            yourScore: 'คะแนนคุณ',
            raceTime: 'เวลาแข่ง',
            duration: 'ระยะเวลา',
            sheepCollected: 'แกะที่เก็บ',
            teamTime: 'เวลาทีม'
        },
        sheepUnit: '{{count}} ตัว'
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'เกิดข้อผิดพลาด',
        uiError: 'UI เกมมีข้อผิดพลาด ลองรีเฟรชหน้า',
        reloadPage: 'โหลดหน้าใหม่',
        errorDetails: 'รายละเอียดข้อผิดพลาด',
        connectionFailed: 'เชื่อมต่อเซิร์ฟเวอร์ผู้เล่นหลายคนไม่ได้',
        gameNotLoaded: 'เกมยังโหลดไม่เสร็จ',
        createRoomFailed: 'สร้างห้องไม่สำเร็จ',
        joinRoomFailed: 'เข้าร่วมห้องไม่สำเร็จ',
        noAvailableRooms: 'ไม่มีห้องว่าง',
        roomCodeLength: 'รหัสห้องต้อง 6 ตัวอักษร'
    },

    // Welcome / Identity
    identity: {
        welcome: 'ยินดีต้อนรับสู่จำลองสุนัขต้อนแกะ!',
        chooseIdentity: 'เลือกว่าต้องการให้รู้จักอย่างไร:',
        welcomeBack: 'ยินดีต้อนรับกลับ, {{name}}!',
        confirmSelection: 'ยืนยันการเลือก',
        continue: 'ดำเนินการต่อ →',
        settingUp: 'กำลังตั้งค่า...',
        customName: 'ชื่อกำหนดเอง',
        customNameDesc: 'เลือกชื่อแสดงผลของคุณเอง',
        enterName: 'ใส่ชื่อของคุณ...',
        randomName: 'ชื่อสุ่ม',
        randomNameDesc: 'รับชื่อแบบสุ่มที่มีธีมการต้อนแกะ',
        anonymous: 'ไม่ระบุชื่อ',
        anonymousDesc: 'เล่นในชื่อ "ผู้เล่น" โดยไม่มีชื่อกำหนดเอง',
        errorEmpty: 'กรุณาใส่ชื่อแสดงผลหรือเลือกตัวเลือกอื่น',
        errorTooLong: 'ชื่อแสดงผลต้องมีไม่เกิน 20 ตัวอักษร',
        errorFailed: 'สร้างข้อมูลผู้เล่นไม่สำเร็จ กรุณาลองอีกครั้ง'
    }
};
