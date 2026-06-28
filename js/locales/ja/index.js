// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Japanese Translations
 * 日本語翻訳 - Sheep Dog Simulator
 */

export default {
    // Common UI elements
    common: {
        back: '戻る',
        backToMenu: '← メニューに戻る',
        start: '開始',
        cancel: 'キャンセル',
        confirm: '確認',
        save: '保存',
        close: '閉じる',
        loading: '読み込み中...',
        error: 'エラー',
        retry: '再試行',
        refresh: '更新',
        copy: 'コピー',
        copied: 'コピーしました！',
        you: 'あなた',
        host: 'ホスト',
        waiting: '待機中...',
        players: 'プレイヤー',
        player: 'プレイヤー'
    },

    // Main menu / Mode selection
    menu: {
        title: 'Sheep Dog Sim',
        soloPlay: 'ソロプレイ',
        soloPlayDesc: '自分のペースで練習',
        local2Player: 'ローカル2人プレイ',
        local2PlayerDesc: '1画面で協力または対戦',
        sandbox: 'サンドボックス',
        sandboxDesc: '羊、フェンス、ルールをカスタマイズ',
        multiplayer: 'マルチプレイヤー',
        multiplayerDesc: 'オンラインで対戦または協力',
        leaderboard: 'ランキング',
        leaderboardDesc: 'グローバルランキングを見る',
        settings: '設定',
        settingsDesc: 'ゲーム設定を調整'
    },

    // Dog selection
    dogs: {
        title: '犬を選ぶ',
        stats: {
            speed: 'スピード',
            stamina: 'スタミナ',
            control: 'コントロール'
        },
        jep: {
            name: 'ジェップ',
            breed: 'ボーダーコリー',
            description: 'バランスの良い牧羊犬、スタミナ良好'
        },
        pip: {
            name: 'ピップ',
            breed: 'オーストラリアン・シェパード',
            description: '素早く敏捷、スピード重視の牧羊に最適'
        },
        sally: {
            name: 'サリー',
            breed: 'ウェルシュ・コーギー',
            description: '優れたコントロールだが動きは遅め'
        },
        shiloh: {
            name: 'シャイロ',
            breed: 'ジャーマン・シェパード',
            description: '強くて安定、優れた持久力'
        },
        georgeWashington: {
            name: 'ジョージ・ワシントン',
            breed: 'アメリカン・フォックスハウンド',
            description: 'バランスの取れた戦術的な牧羊犬'
        }
    },

    // Practice Paddock (Cycle 26 v2.1.0)
    practice: {
        hint: 'WASDまたは矢印キーで移動 · Shiftでダッシュ'
    },

    // 初回プレイのチュートリアル（P1-TUTORIAL）：案内カードとプレイ中のガイド。
    tutorial: {
        offerTitle: '牧羊は初めてですか？',
        offerBody: 'Home Fieldでガイド付きランに挑戦。移動、ダッシュ、カメラ切り替え、吠える操作を覚えて、羊を3匹囲いに入れましょう。',
        offerStart: 'やってみる',
        offerSkip: '今はやめておく',
        skip: 'チュートリアルをスキップ',
        herdProgress: '{{goal}}匹中{{penned}}匹を囲いに入れた',
        step: {
            move: 'WASDまたは矢印キーで犬を動かします。',
            moveTouch: 'ジョイスティックをドラッグして犬を動かします。',
            sprint: 'Shiftを押し続けるとダッシュします。ダッシュはスタミナを消費します。',
            sprintTouch: 'ダッシュボタンを押し続けると一気に加速します。スタミナを消費します。',
            camera: 'Cキーでカメラビューを切り替えます。',
            cameraTouch: '上部のカメラチップをタップしてビューを切り替えます。',
            bark: '群れが前にいるときに吠えるキーを押しましょう。音の波とクールダウンを見てください。',
            barkTouch: '群れが前にいるときに吠えるボタンをタップしましょう。音の波とクールダウンを見てください。',
            herd: '羊を3匹、ゲートから囲いに追い込みましょう。群れの後ろに付くこと。羊はあなたから逃げます。',
            done: '3匹入りました。これで仕事は覚えましたね。残りの群れはあなたに任せます。'
        }
    },

    // Game modes
    modes: {
        title: 'ゲームモードを選ぶ',
        practice: 'のんびりプレイ',
        practiceDesc: 'タイマーなし。羊は30匹だけ。自分のペースでどうぞ。',
        classic: 'クラシックモード',
        classicDesc: '200匹の羊すべてを牧場へ',
        extreme: 'エクストリームモード',
        extremeDesc: '1000匹の羊を牧場へ - パフォーマンスチャレンジ！',
        insane: 'インセインモード',
        insaneDesc: '3000匹の羊を牧場へ - 過酷なチャレンジ！',
        chaos: 'カオスモード',
        chaosDesc: '5000匹の羊を牧場へ - まさに大混乱！'
    },

    // P1-MOBILE-WARN: モバイル端末向けのラウンド前パフォーマンス警告。
    mobileWarning: {
        title: 'この端末には大きな群れです',
        body: '{{sheep}}匹の羊はスマートフォンやタブレットには負荷が大きく、フレーム落ちすることがあります。このまま続けるか、戻って小さな群れを選んでください。',
        continue: 'このまま続ける',
        goBack: '戻る'
    },

    // P1-MOBILE-FALLBACK: 互換レンダリング通知（WebGPU -> WebGL フォールバック）。
    rendererFallback: {
        title: '互換レンダリング',
        body: 'このブラウザではWebGLレンダラーで動作しています。ゲーム内容は同じですが、一部の視覚効果が簡略化されます。'
    },

    // P4-CTX-RESTORE: グラフィックスコンテキスト喪失時、自動リロード直前のオーバーレイ。
    contextLost: {
        title: 'グラフィックスが中断されました',
        body: 'レンダラーを再起動しています。まもなくゲームを再読み込みします。'
    },

    // P4-SW-TOAST: 新しいサービスワーカーが制御を引き継いだときの常設トースト。
    swUpdate: {
        ready: '新しいバージョンが利用できます。'
    },

    // Settings panel
    settings: {
        title: '設定',
        tabs: {
            graphics: 'グラフィック',
            audio: 'オーディオ',
            controls: '操作',
            general: '全般'
        },
        presets: 'パフォーマンスプリセット',
        performanceMode: 'パフォーマンスモード',
        performanceOption: 'パフォーマンス - 最大FPS',
        balancedOption: 'バランス - デフォルト設定',
        qualityOption: 'クオリティ - 最高のビジュアル',
        shadows: '影',
        shadowsDesc: '動的な影を有効にする（デスクトップのみ）',
        experimentalWebGpu: 'WebGPUレンダラー',
        experimentalWebGpuDesc: '実験的機能です。利用可能な場合はWebGPUを使います。オフにするとWebGLで再読み込みします。',
        rendererDiagnostics: 'レンダラーの状態',
        shadowQuality: '影の品質',
        low: '低',
        medium: '中',
        high: '高',
        audioEnabled: 'オーディオ有効',
        audioVolume: 'オーディオ音量',
        showStats: 'パフォーマンス統計を表示',
        showStatsDesc: 'FPSと描画統計を表示',
        keyBindings: 'キーボード操作',
        resetBindings: '初期設定に戻す',
        pressKey: 'キーを押してください...',
        keyConflict: 'そのキーは「{{action}}」に使用されています',
        actions: {
            moveUp: '前進',
            moveDown: '後退',
            moveLeft: '左に移動',
            moveRight: '右に移動',
            sprint: 'ダッシュ',
            bark: '吠える',
            cameraCycle: 'カメラ切り替え',
            pause: 'ポーズ',
            zoomIn: 'ズームイン',
            zoomOut: 'ズームアウト',
            bank: 'スコアを確定',
            note: 'メモを開く',
            moveX: '移動（横）',
            moveY: '移動（縦）'
        },
        cameraModeSection: 'カメラモード（{{key}}で切り替え）',
        cameraModes: {
            follow: 'フォロー',
            followDesc: '犬の後ろからの映画的なクローズアップ（デフォルト）',
            free: 'フリー',
            freeDesc: '右ドラッグで犬の周りを回転',
            classic: 'クラシック',
            classicDesc: '高所からの俯瞰ビュー'
        },
        gamepadSupport: 'ゲームパッド対応',
        gamepadDesc: 'コントローラーは自動検出されます。左スティックで移動、トリガーでダッシュします。',
        // Gamepad config ([P4-GAMEPAD-UI])
        gamepadDeadzone: 'スティックのデッドゾーン',
        gamepadDeadzoneDesc: 'この値未満のスティック入力は無視されます',
        stickPreview: 'スティック入力（デッドゾーン適用後）',
        gamepadButtons: 'ゲームパッドのボタン',
        gamepadAxes: '移動スティックの軸',
        pressButton: 'ボタンを押してください...',
        moveAxis: 'スティックを動かしてください...',
        axisLabel: '軸 {{index}}',
        padConflict: 'そのボタンは「{{action}}」に使用中です',
        axisConflict: 'その軸は「{{action}}」に使用中です',
        resetDefaults: 'デフォルトに戻す',
        language: '言語',
        accessibility: 'アクセシビリティ',
        colorblindMode: '色覚サポート配色',
        colorblindModeDesc: 'メダルとランクの色に色覚多様性に配慮したパレットを使用します',
        tutorialLabel: 'チュートリアル',
        tutorialDesc: 'ガイド付きの牧羊レッスンをもう一度プレイ',
        replayTutorial: 'チュートリアルをやり直す',
        profile: 'プレイヤープロフィール',
        resetProfile: 'プロフィールをリセット',
        resetProfileDesc: 'ローカルのプレイヤー識別情報を消去します。再読み込み時に新しく作成され、統計とキー設定は残ります。',
        resetProfileConfirm: 'プレイヤープロフィールをリセットしますか？再読み込み時に新しい羊飼いの識別情報が作成されます。',
        aboutLink: 'このゲームについて'
    },

    // Sandbox setup
    sandbox: {
        title: 'サンドボックス設定',
        sheepCount: '羊の数',
        numberOfSheep: '羊の数',
        behavior: '行動',
        movementSpeed: '移動速度',
        flockCohesion: '群れの結束',
        separationDistance: '分離距離',
        fieldSize: 'フィールドサイズ',
        fieldShape: 'フィールド形状',
        fenceLayout: 'フェンスレイアウト',
        editFenceLayout: 'フェンスレイアウトを編集',
        editCustomShape: 'カスタム形状を編集',
        drawCustomShape: 'カスタム形状を描く',
        timer: 'タイマー',
        enableTimer: 'タイマーを有効化',
        countUp: 'カウントアップ',
        countUpDesc: 'タイムを記録',
        countdown: 'カウントダウン',
        countdownDesc: '時間との勝負',
        timeLimit: '制限時間',
        winCondition: '勝利条件',
        herdAllSheep: 'すべての羊を牧場へ',
        herdAllSheepDesc: 'クラシック達成 - すべての羊を牧場へ',
        percentageGoal: 'パーセンテージ目標',
        percentageGoalDesc: '目標パーセンテージ達成で完了',
        targetPercentage: '目標パーセンテージ',
        freePlay: 'フリープレイ',
        freePlayDesc: '勝利条件なし - 自由に遊ぼう！',
        startGame: 'ゲーム開始',
        startGameWithCount: 'ゲーム開始（{{count}}匹）',
        tabs: {
            sheep: '羊',
            field: 'フィールド',
            rules: 'ルール'
        },
        sizes: {
            small: '小',
            medium: '中',
            large: '大',
            huge: '特大'
        },
        shapes: {
            square: '正方形',
            wide: '横長',
            tall: '縦長',
            lShape: 'L字型',
            circle: '円形',
            diamond: 'ダイヤ型',
            triangle: '三角形',
            custom: 'カスタム'
        },
        fencePresets: {
            open: 'オープンフィールド',
            openDesc: '内部フェンスなし',
            corridor: '回廊',
            corridorDesc: 'ゲートへの囲まれた道',
            funnel: '漏斗',
            funnelDesc: 'ゲートへ狭まる道',
            maze: '迷路',
            mazeDesc: 'ナビゲートする障害物',
            obstacles: '障害物',
            obstaclesDesc: 'ランダムなフェンス障害物',
            custom: 'カスタム',
            customDesc: '独自のレイアウトを設計'
        }
    },

    // Local 2-player mode
    localMode: {
        title: 'ローカル2人プレイ',
        coop: '協力',
        coopDesc: '協力して200匹の羊を牧場へ',
        versus: '1対1レース',
        versusDesc: '先に100匹の羊を集めた方が勝ち！',
        timed: 'タイムアタック',
        timedDesc: '3分間 - 羊はリスポーン！',
        player: 'プレイヤー',
        controls1: 'WASD + 左Shift',
        controls2: '矢印キー + 右Shift',
        startGame: 'ゲーム開始',
        noLeaderboards: 'ローカルモードのスコアはランキングに送信されません'
    },

    // Fence editor
    fenceEditor: {
        title: 'フェンスレイアウト',
        fenceCount: '{{count}}本のフェンス',
        fenceCountPlural: '{{count}}本のフェンス',
        quickLayouts: 'クイックレイアウト',
        tools: 'ツール',
        draw: '描く',
        select: '選択',
        erase: '消去',
        pan: 'パン',
        clearAll: 'すべて消去',
        done: '完了',
        dogLabel: '犬',
        sheepSpawn: '羊の出現地点',
        helpDraw: 'クリック＆ドラッグでフェンスを描く - 10mグリッドにスナップ',
        helpErase: 'フェンスをクリックして削除',
        helpPan: 'ドラッグでパン - スクロールでズーム',
        helpSelect: 'フェンスをクリックして選択',
        presets: {
            open: 'クリアフィールド',
            corridor: 'ガイド付きパス',
            funnel: '狭まる道',
            maze: '障害物をナビゲート',
            obstacles: 'ランダムブロック'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'マルチプレイヤー',
        publicLobbies: '公開ロビー',
        publicLobbiesDesc: '公開中のゲームを探す',
        createRoom: 'ルーム作成',
        createRoomDesc: '新しいゲームルームをホスト',
        joinRoom: 'ルームに参加',
        joinRoomDesc: 'ルームコードを入力',
        quickMatch: 'クイックマッチ',
        quickMatchDesc: '利用可能なゲームを探す',
        maxPlayers: '最大プレイヤー数',
        playersCount: '{{count}}人',
        gameMode: 'ゲームモード',
        cooperative: '協力',
        cooperativeDesc: '協力してすべての羊を囲いに入れる',
        competitive: '対戦',
        competitiveDesc: '相手より多くの羊を集めて競争',
        timed: 'タイムアタック（3分）',
        timedDesc: '3分間でできるだけ多くのポイントを獲得',
        survival: 'サバイバル（協力）',
        survivalDesc: '日暮れまでに群れを家へ連れ帰り、オオカミの夜をみんなで生き延びましょう。群れの3分の1を失うとランは終了します。',
        // P1-MOBILE-WARN: 1000匹超を選んだモバイルのホストへの注意書き。
        mobileHostHighSheep: 'この端末はモバイルです。羊が1,000匹を超えるルームに参加できるのはデスクトップのみのため、作成したルームに自分では参加できません。',
        roomCode: 'ルームコード',
        enterRoomCode: 'ルームコードを入力',
        leaveRoom: 'ルームを退出',
        startGame: 'ゲーム開始',
        waitingForPlayers: 'プレイヤーを待っています...'
    },

    // Lobby
    lobby: {
        title: 'ゲームロビー',
        roomCode: 'ルームコード',
        playersCount: 'プレイヤー（{{current}}/{{max}}）',
        waitingForMore: 'プレイヤーを待っています...',
        // [P1-SHARE] copy-invite-link affordance.
        copyInviteLink: '招待リンクをコピー',
        inviteLinkCopied: 'リンクをコピーしました'
    },

    // Leaderboard
    leaderboard: {
        title: 'グローバルランキング',
        soloClassic: 'ソロクラシック',
        soloExtreme: 'ソロエクストリーム',
        soloInsane: 'ソロインセイン',
        soloChaos: 'ソロカオス',
        timed: 'タイムアタック',
        competitive: '対戦',
        cooperative: '協力',
        // Cycle 59 (Counting Sheep): カーブ別のランキングタブ。
        countingIncremental: '羊数え（加算式）',
        countingExponential: '羊数え（指数式）',
        // Cycle 66: Newsheepdoglandのサバイバルランキング。
        survival: 'サバイバル',
        updated: '{{time}}に更新',
        loading: 'ランキングを読み込み中...',
        noScores: 'まだスコアがありません。最初の1人になろう！',
        serverOffline: 'サーバーオフライン - ランキングは利用できません。',
        loadFailed: 'ランキングの読み込みに失敗しました。もう一度お試しください。',
        ranks: {
            first: '1位',
            second: '2位',
            third: '3位'
        }
    },

    // Game HUD
    hud: {
        sheepCount: '羊',
        stamina: 'スタミナ',
        time: '時間',
        score: 'スコア',
        timeRemaining: '残り時間',
        complete: '完了',
        // Cycle 59 (Counting Sheep): ラウンド表示のHUD。
        counting: {
            round: 'ラウンド',
            bank: 'スコアを確定して終了'
        }
    },

    // Pause menu
    pause: {
        title: '一時停止',
        tapToResume: '外をタップで再開',
        pressEscToResume: 'ESCキーで再開',
        resume: '再開',
        restart: 'リスタート',
        mainMenu: 'メインメニュー',
        fullscreen: 'フルスクリーン',
        exitFullscreen: 'フルスクリーン終了',
        // Cycle 59 (Counting Sheep): ポーズメニューのスコア確定。
        bankAndFinish: 'スコアを確定して終了'
    },

    // Completion screen
    completion: {
        victory: '勝利！',
        allSheepHerded: '{{count}}匹すべての羊を牧場に入れました！',
        raceComplete: 'レース完了',
        youWon: 'レースに勝ちました！',
        playerWon: '{{name}}が勝ちました！',
        timesUp: 'タイムアップ',
        timesUpVictory: 'タイムアップ - 勝利！',
        youCollectedMost: '最も多くの羊を集めました！',
        playerCollectedMost: '{{name}}が最も多く集めました！',
        teamVictory: 'チーム勝利！',
        teamMessage: '協力してすべての羊を牧場に入れました！',
        gameComplete: 'ゲーム完了',
        wellPlayed: 'お疲れ様でした！',
        newPersonalBest: '新記録！',
        finalStandings: '最終結果',
        playAgain: 'もう一度プレイ',
        scoreSaved: 'リーダーボードに保存しました',
        scoreSaveFailed: 'スコアを保存できませんでした',
        nextChallenge: '次のチャレンジ',
        saveClip: '開発用クリップを保存',
        stats: {
            time: '時間',
            yourScore: 'あなたのスコア',
            raceTime: 'レースタイム',
            duration: '所要時間',
            sheepCollected: '集めた羊',
            teamTime: 'チームタイム'
        },
        sheepUnit: '{{count}}匹',
        // [P1-SHARE] completion share button + Web Share / clipboard payload.
        share: {
            button: '共有',
            copied: 'コピーしました',
            title: 'Sheep Dog Sim',
            single: 'Sheep Dog Simで{{count}}匹の羊を{{time}}で柵に追い込みました。',
            counting: 'Sheep Dog Simで羊を{{count}}匹数えてラウンド{{round}}に到達しました。',
            mpWin: 'Sheep Dog Simのマルチプレイで{{count}}匹の羊を集めて勝ちました。',
            mpScore: 'Sheep Dog Simのマルチプレイで{{count}}匹の羊を柵に入れました。',
            cooperative: 'Sheep Dog Simでチームで{{count}}匹の羊を集めました。',
            generic: 'Sheep Dog Simで1ラウンド遊びました。'
        },
        // Cycle 59 (Counting Sheep): スコア確定時のサマリー。
        counting: {
            title: '数えた羊',
            subtitle: 'スコア確定までに{{count}}匹数えました。',
            counted: '数えた数',
            round: '到達ラウンド'
        }
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'エラーが発生しました',
        uiError: 'ゲームUIでエラーが発生しました。ページを更新してください。',
        reloadPage: 'ページを再読み込み',
        errorDetails: 'エラーの詳細',
        connectionFailed: 'マルチプレイヤーサーバーに接続できません。',
        gameNotLoaded: 'ゲームが完全に読み込まれていません。',
        createRoomFailed: 'ルームの作成に失敗しました。',
        joinRoomFailed: 'ルームへの参加に失敗しました',
        noAvailableRooms: '利用可能なルームがありません',
        roomCodeLength: 'ルームコードは6文字である必要があります'
    },

    // Welcome / Identity
    identity: {
        welcome: 'Sheep Dog Simへようこそ！',
        chooseIdentity: '表示名を選んでください：',
        welcomeBack: 'おかえりなさい、{{name}}さん！',
        confirmSelection: '選択を確認',
        nameUpdated: '名前を更新しました',
        continue: '続ける →',
        settingUp: '設定中...',
        customName: 'カスタム名',
        customNameDesc: '独自の表示名を選択',
        enterName: '名前を入力...',
        randomName: 'ランダム名',
        randomNameDesc: '牧羊をテーマにしたランダムな名前を取得',
        anonymous: '匿名のまま',
        anonymousDesc: 'カスタム名なしで「プレイヤー」としてプレイ',
        errorEmpty: '表示名を入力するか、他のオプションを選択してください',
        errorTooLong: '表示名は20文字以内にしてください',
        errorFailed: 'プレイヤーIDの作成に失敗しました。もう一度お試しください。'
    },

    // [P3-ACHIEVE-DATA] 実績の名前と説明。
    achievements: {
        // [P3-ACHIEVE-UI] UI: 解除トーストとメニューの一覧。
        ui: {
            toastTitle: '実績を解除しました',
            panelTitle: '実績',
            summary: '{{total}}件中{{unlocked}}件解除',
            locked: '未解除',
            unlockedOn: '{{date}}に解除'
        },
        firstPen: {
            name: 'はじめての囲い込み',
            desc: '初めて群れ全体を囲いに入れる。'
        },
        pen200HomeField: {
            name: 'Home Fieldクラシック',
            desc: 'Home Fieldのソロクラシックで200頭の羊を囲いに入れる。'
        },
        pen200RollingHills: {
            name: 'Rolling Hillsクラシック',
            desc: 'Rolling Hillsでクラシックの75頭の群れを囲いに入れる。'
        },
        pen200OpenCountry: {
            name: 'Open Countryクラシック',
            desc: 'Open Countryでクラシックの50頭の群れを囲いに入れる。'
        },
        chaos5000: {
            name: 'カオスの羊飼い',
            desc: 'ソロカオスで5,000頭の羊を囲いに入れる。'
        },
        allFiveDogs: {
            name: '犬舎フルメンバー',
            desc: '5匹の犬それぞれでソロラウンドをクリアする。'
        },
        surviveFirstNight: {
            name: '最初の夜',
            desc: 'Newsheepdoglandで最初の夜を生き延びる。'
        },
        survive5Nights: {
            name: '5つの夜',
            desc: 'Newsheepdoglandの1回のランで5晩を生き延びる。'
        },
        winCompetitiveRoom: {
            name: 'トップドッグ',
            desc: '対戦マルチプレイヤールームで勝利する。'
        }
    }
};
