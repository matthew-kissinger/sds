/**
 * Korean Translations
 * 한국어 번역
 */

export default {
    // Common UI elements
    common: {
        back: '뒤로',
        backToMenu: '← 메뉴로 돌아가기',
        start: '시작',
        cancel: '취소',
        confirm: '확인',
        save: '저장',
        close: '닫기',
        loading: '로딩 중...',
        error: '오류',
        retry: '다시 시도',
        refresh: '새로고침',
        copy: '복사',
        copied: '복사됨!',
        you: '나',
        host: '호스트',
        waiting: '대기 중...',
        players: '플레이어',
        player: '플레이어'
    },

    // Main menu / Mode selection
    menu: {
        title: '양치기 개 시뮬레이터',
        soloPlay: '솔로 플레이',
        soloPlayDesc: '나만의 속도로 양몰이 연습',
        local2Player: '로컬 2인용',
        local2PlayerDesc: '한 화면에서 협동 또는 대결',
        sandbox: '샌드박스',
        sandboxDesc: '양, 울타리, 규칙을 커스터마이즈',
        multiplayer: '멀티플레이어',
        multiplayerDesc: '온라인으로 협동 또는 경쟁',
        leaderboard: '리더보드',
        leaderboardDesc: '글로벌 순위 보기',
        settings: '설정',
        settingsDesc: '게임 설정 조정'
    },

    // Dog selection
    dogs: {
        title: '당신의 개를 선택하세요',
        stats: {
            speed: '속도',
            stamina: '체력',
            control: '컨트롤'
        },
        jep: {
            name: '젭',
            breed: '보더 콜리',
            description: '균형 잡힌 양치기 개, 좋은 체력'
        },
        pip: {
            name: '핍',
            breed: '오스트레일리안 셰퍼드',
            description: '빠르고 민첩함, 빠른 양몰이에 적합'
        },
        sally: {
            name: '샐리',
            breed: '웰시 코기',
            description: '훌륭한 컨트롤이지만 느린 이동'
        },
        shiloh: {
            name: '샤일로',
            breed: '저먼 셰퍼드',
            description: '강하고 안정적이며 뛰어난 지구력'
        },
        georgeWashington: {
            name: '조지 워싱턴',
            breed: '아메리칸 폭스하운드',
            description: '균형 잡힌 능력의 전략적 양치기 개'
        }
    },

    // Game modes
    modes: {
        title: '게임 모드 선택',
        classic: '클래식 모드',
        classicDesc: '200마리 양을 목장으로 몰기',
        extreme: '익스트림 모드',
        extremeDesc: '1000마리 양을 몰기 - 성능 도전!'
    },

    // Settings panel
    settings: {
        title: '설정',
        performanceMode: '성능 모드',
        performanceOption: '성능 - 최대 FPS',
        balancedOption: '균형 - 기본 설정',
        qualityOption: '품질 - 최고 비주얼',
        audioEnabled: '오디오 활성화',
        audioVolume: '오디오 볼륨',
        showStats: '성능 통계 표시',
        resetDefaults: '기본값으로 재설정',
        language: '언어'
    },

    // Sandbox setup
    sandbox: {
        title: '샌드박스 설정',
        sheepCount: '양 수',
        numberOfSheep: '양의 수',
        behavior: '행동',
        movementSpeed: '이동 속도',
        flockCohesion: '무리 응집력',
        separationDistance: '분리 거리',
        fieldSize: '필드 크기',
        fieldShape: '필드 모양',
        fenceLayout: '울타리 레이아웃',
        editFenceLayout: '울타리 레이아웃 편집',
        editCustomShape: '커스텀 모양 편집',
        drawCustomShape: '커스텀 모양 그리기',
        timer: '타이머',
        enableTimer: '타이머 활성화',
        countUp: '카운트 업',
        countUpDesc: '시간 측정',
        countdown: '카운트다운',
        countdownDesc: '시간과의 경쟁',
        timeLimit: '제한 시간',
        winCondition: '승리 조건',
        herdAllSheep: '모든 양 몰기',
        herdAllSheepDesc: '클래식 완료 - 모든 양을 목장으로',
        percentageGoal: '퍼센티지 목표',
        percentageGoalDesc: '목표 퍼센티지 달성 시 완료',
        targetPercentage: '목표 퍼센티지',
        freePlay: '자유 플레이',
        freePlayDesc: '승리 조건 없음 - 그냥 플레이!',
        startGame: '게임 시작',
        startGameWithCount: '게임 시작 (양 {{count}}마리)',
        tabs: {
            sheep: '양',
            field: '필드',
            rules: '규칙'
        },
        sizes: {
            small: '작음',
            medium: '중간',
            large: '큼',
            huge: '거대'
        },
        shapes: {
            square: '정사각형',
            wide: '가로형',
            tall: '세로형',
            lShape: 'L자형',
            circle: '원형',
            diamond: '다이아몬드',
            triangle: '삼각형',
            custom: '커스텀'
        },
        fencePresets: {
            open: '오픈 필드',
            openDesc: '내부 울타리 없음',
            corridor: '복도',
            corridorDesc: '게이트로 가는 울타리 경로',
            funnel: '깔때기',
            funnelDesc: '게이트로 좁아지는 경로',
            maze: '미로',
            mazeDesc: '통과해야 할 장애물',
            obstacles: '장애물',
            obstaclesDesc: '무작위 울타리 장애물',
            custom: '커스텀',
            customDesc: '나만의 레이아웃 디자인'
        }
    },

    // Local 2-player mode
    localMode: {
        title: '로컬 2인용',
        coop: '협동',
        coopDesc: '함께 200마리 양을 몰기',
        versus: '1v1 레이스',
        versusDesc: '먼저 100마리 양을 모은 사람이 승리!',
        timed: '타임어택',
        timedDesc: '3분 - 양이 리스폰됩니다!',
        player: '플레이어',
        controls1: 'WASD + L.Shift',
        controls2: '방향키 + R.Shift',
        startGame: '게임 시작',
        noLeaderboards: '로컬 모드 점수는 리더보드에 제출되지 않습니다'
    },

    // Fence editor
    fenceEditor: {
        title: '울타리 레이아웃',
        fenceCount: '울타리 {{count}}개',
        fenceCountPlural: '울타리 {{count}}개',
        quickLayouts: '빠른 레이아웃',
        tools: '도구',
        draw: '그리기',
        select: '선택',
        erase: '지우기',
        pan: '이동',
        clearAll: '모두 지우기',
        done: '완료',
        dogLabel: '개',
        sheepSpawn: '양 스폰 지점',
        helpDraw: '클릭 후 드래그하여 울타리 그리기 - 10m 그리드 스냅',
        helpErase: '울타리를 클릭하여 삭제',
        helpPan: '드래그하여 이동 - 스크롤하여 확대/축소',
        helpSelect: '울타리를 클릭하여 선택',
        presets: {
            open: '빈 필드',
            corridor: '안내 경로',
            funnel: '좁아지는 경로',
            maze: '장애물 통과',
            obstacles: '무작위 블록'
        }
    },

    // Multiplayer
    multiplayer: {
        title: '멀티플레이어',
        createRoom: '방 만들기',
        createRoomDesc: '새 게임 방 호스트',
        joinRoom: '방 참가',
        joinRoomDesc: '방 코드 입력',
        quickMatch: '빠른 매치',
        quickMatchDesc: '가능한 게임 찾기',
        maxPlayers: '최대 플레이어',
        playersCount: '{{count}}명',
        gameMode: '게임 모드',
        cooperative: '협동 모드',
        cooperativeDesc: '함께 모든 양을 우리로 몰기',
        competitive: '경쟁 모드',
        competitiveDesc: '상대보다 먼저 가장 많은 양을 모으기',
        timed: '타임어택 (3분)',
        timedDesc: '3분 안에 최대한 많은 점수 획득',
        roomCode: '방 코드',
        enterRoomCode: '방 코드 입력',
        leaveRoom: '방 나가기',
        startGame: '게임 시작',
        waitingForPlayers: '플레이어 대기 중...'
    },

    // Lobby
    lobby: {
        title: '게임 로비',
        roomCode: '방 코드',
        playersCount: '플레이어 ({{current}}/{{max}})',
        waitingForMore: '더 많은 플레이어 대기 중...'
    },

    // Leaderboard
    leaderboard: {
        title: '글로벌 리더보드',
        soloClassic: '솔로 클래식',
        soloExtreme: '솔로 익스트림',
        timed: '타임어택 (3분)',
        competitive: '경쟁 모드',
        cooperative: '협동 모드',
        updated: '{{time}} 업데이트',
        loading: '리더보드 로딩 중...',
        noScores: '아직 기록된 점수가 없습니다. 첫 번째가 되세요!',
        serverOffline: '서버 오프라인 - 리더보드 이용 불가. 서버가 시작 중이거나 일시적으로 다운되었을 수 있습니다.',
        loadFailed: '리더보드 로드 실패. 다시 시도해 주세요.',
        ranks: {
            first: '1위',
            second: '2위',
            third: '3위'
        }
    },

    // Game HUD
    hud: {
        sheepCount: '양',
        stamina: '체력',
        time: '시간',
        score: '점수',
        timeRemaining: '남은 시간',
        complete: '완료'
    },

    // Pause menu
    pause: {
        title: '일시정지',
        tapToResume: '바깥쪽을 탭하여 재개',
        pressEscToResume: 'ESC를 눌러 재개',
        resume: '재개',
        restart: '재시작',
        mainMenu: '메인 메뉴',
        fullscreen: '전체화면',
        exitFullscreen: '전체화면 종료'
    },

    // Completion screen
    completion: {
        victory: '승리!',
        allSheepHerded: '{{count}}마리 양 몰기 성공!',
        raceComplete: '레이스 완료',
        youWon: '당신이 이겼습니다!',
        playerWon: '{{name}} 승리!',
        timesUp: '시간 종료',
        timesUpVictory: '시간 종료 - 승리!',
        youCollectedMost: '당신이 가장 많은 양을 모았습니다!',
        playerCollectedMost: '{{name}}이(가) 가장 많이 모았습니다!',
        teamVictory: '팀 승리!',
        teamMessage: '팀워크로 모든 양을 몰았습니다!',
        gameComplete: '게임 완료',
        wellPlayed: '잘 플레이했습니다!',
        newPersonalBest: '새로운 개인 최고 기록!',
        finalStandings: '최종 순위',
        playAgain: '다시 플레이',
        nextChallenge: '다음 도전',
        stats: {
            time: '시간',
            yourScore: '당신의 점수',
            raceTime: '레이스 시간',
            duration: '소요 시간',
            sheepCollected: '모은 양',
            teamTime: '팀 시간'
        },
        sheepUnit: '양 {{count}}마리'
    },

    // Errors and alerts
    errors: {
        somethingWrong: '문제가 발생했습니다',
        uiError: '게임 UI에 오류가 발생했습니다. 페이지를 새로고침해 보세요.',
        reloadPage: '페이지 새로고침',
        errorDetails: '오류 세부정보',
        connectionFailed: '멀티플레이어 서버에 연결할 수 없습니다.',
        gameNotLoaded: '게임이 완전히 로드되지 않았습니다.',
        createRoomFailed: '방 생성 실패.',
        joinRoomFailed: '방 참가 실패',
        noAvailableRooms: '이용 가능한 방 없음',
        roomCodeLength: '방 코드는 6자여야 합니다'
    },

    // Welcome / Identity
    identity: {
        welcome: '양치기 개 시뮬레이터에 오신 것을 환영합니다!',
        chooseIdentity: '사용할 이름을 선택하세요:',
        welcomeBack: '다시 오셨군요, {{name}}님!',
        confirmSelection: '선택 확인',
        continue: '계속 →',
        settingUp: '설정 중...',
        customName: '커스텀 이름',
        customNameDesc: '원하는 표시 이름 선택',
        enterName: '이름을 입력하세요...',
        randomName: '랜덤 이름',
        randomNameDesc: '무작위로 생성된 목양 테마 이름 받기',
        anonymous: '익명 유지',
        anonymousDesc: '커스텀 이름 없이 "플레이어"로 플레이',
        errorEmpty: '표시 이름을 입력하거나 다른 옵션을 선택하세요',
        errorTooLong: '표시 이름은 20자 이하여야 합니다',
        errorFailed: '플레이어 신원 생성에 실패했습니다. 다시 시도하세요.'
    }
};
