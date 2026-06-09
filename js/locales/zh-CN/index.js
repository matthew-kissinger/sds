// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Chinese (Simplified) Translations
 * 简体中文翻译
 */

export default {
    // Common UI elements
    common: {
        back: '返回',
        backToMenu: '← 返回菜单',
        start: '开始',
        cancel: '取消',
        confirm: '确认',
        save: '保存',
        close: '关闭',
        loading: '加载中...',
        error: '错误',
        retry: '重试',
        refresh: '刷新',
        copy: '复制',
        copied: '已复制！',
        you: '你',
        host: '房主',
        waiting: '等待中...',
        players: '玩家',
        player: '玩家'
    },

    // Main menu / Mode selection
    menu: {
        title: '牧羊犬模拟器',
        soloPlay: '单人模式',
        soloPlayDesc: '按自己的节奏练习放牧',
        local2Player: '本地双人',
        local2PlayerDesc: '同屏合作或对战',
        sandbox: '沙盒模式',
        sandboxDesc: '自定义羊群、围栏和规则',
        multiplayer: '多人模式',
        multiplayerDesc: '在线合作或竞技',
        leaderboard: '排行榜',
        leaderboardDesc: '查看全球排名',
        settings: '设置',
        settingsDesc: '调整游戏设置'
    },

    // Dog selection
    dogs: {
        title: '选择你的牧羊犬',
        stats: {
            speed: '速度',
            stamina: '耐力',
            control: '控制'
        },
        jep: {
            name: '杰普',
            breed: '边境牧羊犬',
            description: '均衡的牧羊犬，耐力出色'
        },
        pip: {
            name: '皮普',
            breed: '澳大利亚牧羊犬',
            description: '速度快且敏捷，适合快速放牧'
        },
        sally: {
            name: '萨莉',
            breed: '威尔士柯基',
            description: '控制力强但移动较慢'
        },
        shiloh: {
            name: '夏洛',
            breed: '德国牧羊犬',
            description: '强壮稳健，耐力极佳'
        },
        georgeWashington: {
            name: '乔治·华盛顿',
            breed: '美国猎狐犬',
            description: '战术型牧羊犬，能力均衡'
        }
    },

    // Game modes
    modes: {
        title: '选择游戏模式',
        classic: '经典模式',
        classicDesc: '将200只羊赶入牧场',
        extreme: '极限模式',
        extremeDesc: '将1000只羊赶入牧场 - 性能挑战！'
    },

    // P1-MOBILE-WARN: 移动端开局前的性能提示。
    mobileWarning: {
        title: '对这台设备来说羊群太大了',
        body: '{{sheep}} 只羊对手机或平板来说负担很大，可能会掉帧。你可以继续，也可以返回选一个小一点的羊群。',
        continue: '仍要继续',
        goBack: '返回'
    },

    // P1-MOBILE-FALLBACK: 兼容渲染提示（WebGPU -> WebGL 回退）。
    rendererFallback: {
        title: '兼容渲染模式',
        body: '此浏览器正在使用 WebGL 渲染器。游戏玩法不变，部分画面细节有所降低。'
    },

    // Settings panel
    settings: {
        title: '设置',
        tabs: {
            graphics: '图形',
            audio: '音频',
            controls: '操作',
            general: '通用'
        },
        presets: '性能预设',
        performanceMode: '性能模式',
        performanceOption: '性能优先 - 最高帧率',
        balancedOption: '均衡 - 默认设置',
        qualityOption: '画质优先 - 最佳视觉效果',
        shadows: '阴影',
        shadowsDesc: '启用动态阴影（仅桌面端）',
        experimentalWebGpu: 'WebGPU 渲染器',
        experimentalWebGpuDesc: '实验性功能。可用时使用 WebGPU；关闭后将以 WebGL 重新加载。',
        shadowQuality: '阴影质量',
        low: '低',
        medium: '中',
        high: '高',
        audioEnabled: '启用音效',
        audioVolume: '音量',
        showStats: '显示性能统计',
        showStatsDesc: '显示帧率和渲染统计',
        keyBindings: '键盘控制',
        resetBindings: '恢复默认按键',
        pressKey: '请按一个键...',
        keyConflict: '该键已用于“{{action}}”',
        actions: {
            moveUp: '前进',
            moveDown: '后退',
            moveLeft: '向左移动',
            moveRight: '向右移动',
            sprint: '冲刺',
            bark: '吠叫',
            cameraCycle: '切换镜头',
            pause: '暂停'
        },
        cameraModeSection: '镜头模式（按 {{key}} 切换）',
        cameraModes: {
            follow: '跟随',
            followDesc: '牧羊犬身后的电影式特写（默认）',
            free: '自由',
            freeDesc: '按住鼠标右键拖动以环绕牧羊犬',
            classic: '经典',
            classicDesc: '高空等距俯视视角'
        },
        gamepadSupport: '手柄支持',
        gamepadDesc: '自动检测手柄。左摇杆移动，扳机键冲刺。',
        resetDefaults: '恢复默认',
        language: '语言',
        accessibility: '无障碍',
        colorblindMode: '色觉友好配色',
        colorblindModeDesc: '奖牌和排名颜色使用色盲安全调色板',
        tutorialLabel: '教程',
        tutorialDesc: '再次进行引导牧羊课程',
        replayTutorial: '重玩教程',
        profile: '玩家档案',
        resetProfile: '重置档案',
        resetProfileDesc: '清除本地玩家身份。重新加载时会创建新身份；统计数据和按键设置保留。',
        resetProfileConfirm: '要重置玩家档案吗？重新加载游戏时将创建新的牧羊人身份。',
        aboutLink: '关于本游戏'
    },

    // Sandbox setup
    sandbox: {
        title: '沙盒设置',
        sheepCount: '羊的数量',
        numberOfSheep: '羊的数量',
        behavior: '行为',
        movementSpeed: '移动速度',
        flockCohesion: '群体凝聚力',
        separationDistance: '分离距离',
        fieldSize: '场地大小',
        fieldShape: '场地形状',
        fenceLayout: '围栏布局',
        editFenceLayout: '编辑围栏布局',
        editCustomShape: '编辑自定义形状',
        drawCustomShape: '绘制自定义形状',
        timer: '计时器',
        enableTimer: '启用计时器',
        countUp: '正计时',
        countUpDesc: '记录你的时间',
        countdown: '倒计时',
        countdownDesc: '与时间赛跑',
        timeLimit: '时间限制',
        winCondition: '胜利条件',
        herdAllSheep: '赶完所有羊',
        herdAllSheepDesc: '经典完成条件 - 所有羊进入牧场',
        percentageGoal: '百分比目标',
        percentageGoalDesc: '达到目标百分比即可完成',
        targetPercentage: '目标百分比',
        freePlay: '自由模式',
        freePlayDesc: '无胜利条件 - 尽情游玩！',
        startGame: '开始游戏',
        startGameWithCount: '开始游戏（{{count}}只羊）',
        tabs: {
            sheep: '羊群',
            field: '场地',
            rules: '规则'
        },
        sizes: {
            small: '小',
            medium: '中',
            large: '大',
            huge: '超大'
        },
        shapes: {
            square: '正方形',
            wide: '横向',
            tall: '纵向',
            lShape: 'L形',
            circle: '圆形',
            diamond: '菱形',
            triangle: '三角形',
            custom: '自定义'
        },
        fencePresets: {
            open: '开放场地',
            openDesc: '无内部围栏',
            corridor: '走廊',
            corridorDesc: '通往门口的围栏通道',
            funnel: '漏斗',
            funnelDesc: '向门口收窄的通道',
            maze: '迷宫',
            mazeDesc: '需要导航的障碍',
            obstacles: '障碍物',
            obstaclesDesc: '随机围栏障碍',
            custom: '自定义',
            customDesc: '设计你自己的布局'
        }
    },

    // Local 2-player mode
    localMode: {
        title: '本地双人',
        coop: '合作',
        coopDesc: '一起放牧200只羊',
        versus: '1v1竞速',
        versusDesc: '先赶到100只羊获胜！',
        timed: '限时赛',
        timedDesc: '3分钟 - 羊会重生！',
        player: '玩家',
        controls1: 'WASD + 左Shift',
        controls2: '方向键 + 右Shift',
        startGame: '开始游戏',
        noLeaderboards: '本地模式的分数不会提交到排行榜'
    },

    // Fence editor
    fenceEditor: {
        title: '围栏布局',
        fenceCount: '{{count}}个围栏',
        fenceCountPlural: '{{count}}个围栏',
        quickLayouts: '快速布局',
        tools: '工具',
        draw: '绘制',
        select: '选择',
        erase: '擦除',
        pan: '平移',
        clearAll: '清除全部',
        done: '完成',
        dogLabel: '牧羊犬',
        sheepSpawn: '羊群出生点',
        helpDraw: '点击并拖动绘制围栏 - 网格对齐10米',
        helpErase: '点击围栏删除',
        helpPan: '拖动平移 - 滚动缩放',
        helpSelect: '点击选择围栏',
        presets: {
            open: '清空场地',
            corridor: '引导通道',
            funnel: '收窄通道',
            maze: '穿越障碍',
            obstacles: '随机障碍'
        }
    },

    // Multiplayer
    multiplayer: {
        title: '多人模式',
        createRoom: '创建房间',
        createRoomDesc: '主持一个新游戏房间',
        joinRoom: '加入房间',
        joinRoomDesc: '输入房间代码',
        quickMatch: '快速匹配',
        quickMatchDesc: '寻找可用游戏',
        maxPlayers: '最大玩家数',
        playersCount: '{{count}}名玩家',
        gameMode: '游戏模式',
        cooperative: '合作模式',
        cooperativeDesc: '共同将所有羊赶入羊圈',
        competitive: '竞技模式',
        competitiveDesc: '抢在对手之前收集最多的羊',
        timed: '限时赛（3分钟）',
        timedDesc: '在3分钟内尽可能多得分',
        // P1-MOBILE-WARN: 移动端房主选择超过 1000 只羊时的提示。
        mobileHostHighSheep: '这台设备是移动端。超过 1,000 只羊的房间只允许桌面端玩家加入，所以你将无法加入自己创建的房间。',
        roomCode: '房间代码',
        enterRoomCode: '输入房间代码',
        leaveRoom: '离开房间',
        startGame: '开始游戏',
        waitingForPlayers: '等待玩家加入...'
    },

    // Lobby
    lobby: {
        title: '游戏大厅',
        roomCode: '房间代码',
        playersCount: '玩家（{{current}}/{{max}}）',
        waitingForMore: '等待更多玩家...',
        // [P1-SHARE] copy-invite-link affordance.
        copyInviteLink: '复制邀请链接',
        inviteLinkCopied: '链接已复制'
    },

    // Leaderboard
    leaderboard: {
        title: '全球排行榜',
        soloClassic: '单人经典',
        soloExtreme: '单人极限',
        timed: '限时赛（3分钟）',
        competitive: '竞技模式',
        cooperative: '合作模式',
        updated: '更新于 {{time}}',
        loading: '加载排行榜...',
        noScores: '暂无记录。成为第一个！',
        serverOffline: '服务器离线 - 排行榜不可用。服务器可能正在启动或暂时关闭。',
        loadFailed: '加载排行榜失败。请重试。',
        ranks: {
            first: '第1名',
            second: '第2名',
            third: '第3名'
        }
    },

    // Game HUD
    hud: {
        sheepCount: '羊',
        stamina: '耐力',
        time: '时间',
        score: '分数',
        timeRemaining: '剩余时间',
        complete: '完成'
    },

    // Pause menu
    pause: {
        title: '暂停',
        tapToResume: '点击其他区域继续',
        pressEscToResume: '按ESC键继续',
        resume: '继续',
        restart: '重新开始',
        mainMenu: '主菜单',
        fullscreen: '全屏',
        exitFullscreen: '退出全屏'
    },

    // Completion screen
    completion: {
        victory: '胜利！',
        allSheepHerded: '成功放牧{{count}}只羊！',
        raceComplete: '竞速完成',
        youWon: '你赢了！',
        playerWon: '{{name}}获胜！',
        timesUp: '时间到',
        timesUpVictory: '时间到 - 胜利！',
        youCollectedMost: '你收集了最多的羊！',
        playerCollectedMost: '{{name}}收集了最多的羊！',
        teamVictory: '团队胜利！',
        teamMessage: '团队合作，成功放牧所有羊！',
        gameComplete: '游戏完成',
        wellPlayed: '精彩表现！',
        newPersonalBest: '新个人最佳记录！',
        finalStandings: '最终排名',
        playAgain: '再玩一次',
        scoreSaved: '已保存到排行榜',
        scoreSaveFailed: '无法保存你的成绩',
        nextChallenge: '下一个挑战',
        stats: {
            time: '时间',
            yourScore: '你的分数',
            raceTime: '竞速时间',
            duration: '时长',
            sheepCollected: '收集的羊',
            teamTime: '团队时间'
        },
        sheepUnit: '{{count}}只羊',
        // [P1-SHARE] completion share button + Web Share / clipboard payload.
        share: {
            button: '分享',
            copied: '已复制',
            title: 'Sheep Dog Sim',
            single: '在 Sheep Dog Sim 用 {{time}} 把 {{count}} 只羊赶进了羊圈。',
            counting: '在 Sheep Dog Sim 数了 {{count}} 只羊，到达第 {{round}} 轮。',
            mpWin: '在 Sheep Dog Sim 多人对局中以 {{count}} 只羊获胜。',
            mpScore: '在 Sheep Dog Sim 多人对局中圈了 {{count}} 只羊。',
            cooperative: '在 Sheep Dog Sim 和队友一起赶了 {{count}} 只羊。',
            generic: '在 Sheep Dog Sim 玩了一局。'
        }
    },

    // Errors and alerts
    errors: {
        somethingWrong: '出现错误',
        uiError: '游戏界面遇到错误。请尝试刷新页面。',
        reloadPage: '重新加载',
        errorDetails: '错误详情',
        connectionFailed: '无法连接到多人游戏服务器。',
        gameNotLoaded: '游戏尚未完全加载。',
        createRoomFailed: '创建房间失败。',
        joinRoomFailed: '加入房间失败',
        noAvailableRooms: '没有可用的房间',
        roomCodeLength: '房间代码必须是6个字符'
    },

    // Welcome / Identity
    identity: {
        welcome: '欢迎来到牧羊犬模拟器！',
        chooseIdentity: '选择你想使用的名字：',
        welcomeBack: '欢迎回来，{{name}}！',
        confirmSelection: '确认选择',
        nameUpdated: '名称已更新',
        continue: '继续 →',
        settingUp: '设置中...',
        customName: '自定义名称',
        customNameDesc: '选择你自己的显示名称',
        enterName: '输入你的名字...',
        randomName: '随机名称',
        randomNameDesc: '获取一个随机生成的牧羊主题名称',
        anonymous: '保持匿名',
        anonymousDesc: '以"玩家"身份游玩，不使用自定义名称',
        errorEmpty: '请输入显示名称或选择其他选项',
        errorTooLong: '显示名称必须在20个字符以内',
        errorFailed: '创建玩家身份失败。请重试。'
    }
};
