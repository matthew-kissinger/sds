/**
 * Russian Translations
 * Русский перевод
 */

export default {
    // Common UI elements
    common: {
        back: 'Назад',
        backToMenu: '← Вернуться в меню',
        start: 'Начать',
        cancel: 'Отмена',
        confirm: 'Подтвердить',
        save: 'Сохранить',
        close: 'Закрыть',
        loading: 'Загрузка...',
        error: 'Ошибка',
        retry: 'Повторить',
        refresh: 'Обновить',
        copy: 'Копировать',
        copied: 'Скопировано!',
        you: 'Вы',
        host: 'Хост',
        waiting: 'Ожидание...',
        players: 'Игроки',
        player: 'Игрок'
    },

    // Main menu / Mode selection
    menu: {
        title: 'Симулятор Пастушьей Собаки',
        soloPlay: 'Одиночная игра',
        soloPlayDesc: 'Практикуйте выпас в своём темпе',
        local2Player: 'Локальная игра на двоих',
        local2PlayerDesc: 'Кооператив или соревнование на одном экране',
        sandbox: 'Песочница',
        sandboxDesc: 'Настройте овец, заборы и правила',
        multiplayer: 'Мультиплеер',
        multiplayerDesc: 'Соревнуйтесь или сотрудничайте онлайн',
        leaderboard: 'Таблица лидеров',
        leaderboardDesc: 'Смотрите глобальные рейтинги',
        settings: 'Настройки',
        settingsDesc: 'Изменить настройки игры'
    },

    // Dog selection
    dogs: {
        title: 'Выберите свою собаку',
        stats: {
            speed: 'Скорость',
            stamina: 'Выносливость',
            control: 'Управление'
        },
        jep: {
            name: 'Джеп',
            breed: 'Бордер-колли',
            description: 'Сбалансированный пастух с хорошей выносливостью'
        },
        pip: {
            name: 'Пип',
            breed: 'Австралийская овчарка',
            description: 'Быстрый и ловкий, идеален для быстрого выпаса'
        },
        sally: {
            name: 'Салли',
            breed: 'Вельш-корги',
            description: 'Отличное управление, но медленнее'
        },
        shiloh: {
            name: 'Шайло',
            breed: 'Немецкая овчарка',
            description: 'Сильный и устойчивый с отличной выносливостью'
        },
        georgeWashington: {
            name: 'Джордж Вашингтон',
            breed: 'Американский фоксхаунд',
            description: 'Тактический пастух со сбалансированными способностями'
        }
    },

    // Game modes
    modes: {
        title: 'Выберите режим игры',
        classic: 'Классический режим',
        classicDesc: 'Загоните всех 200 овец на пастбище',
        extreme: 'Экстремальный режим',
        extremeDesc: 'Загоните все 1000 овец - испытание производительности!'
    },

    // Settings panel
    settings: {
        title: 'Настройки',
        performanceMode: 'Режим производительности',
        performanceOption: 'Производительность - Максимум FPS',
        balancedOption: 'Баланс - Стандартные настройки',
        qualityOption: 'Качество - Лучшая графика',
        audioEnabled: 'Звук включён',
        audioVolume: 'Громкость',
        showStats: 'Показывать статистику',
        resetDefaults: 'Сбросить настройки',
        language: 'Язык'
    },

    // Sandbox setup
    sandbox: {
        title: 'Настройка песочницы',
        sheepCount: 'Количество овец',
        numberOfSheep: 'Число овец',
        behavior: 'Поведение',
        movementSpeed: 'Скорость движения',
        flockCohesion: 'Сплочённость стада',
        separationDistance: 'Дистанция разделения',
        fieldSize: 'Размер поля',
        fieldShape: 'Форма поля',
        fenceLayout: 'Расположение заборов',
        editFenceLayout: 'Редактировать заборы',
        editCustomShape: 'Редактировать форму',
        drawCustomShape: 'Нарисовать форму',
        timer: 'Таймер',
        enableTimer: 'Включить таймер',
        countUp: 'Отсчёт вверх',
        countUpDesc: 'Отслеживайте время',
        countdown: 'Обратный отсчёт',
        countdownDesc: 'Гонка со временем',
        timeLimit: 'Ограничение времени',
        winCondition: 'Условие победы',
        herdAllSheep: 'Загнать всех овец',
        herdAllSheepDesc: 'Классическое завершение - все овцы на пастбище',
        percentageGoal: 'Процентная цель',
        percentageGoalDesc: 'Завершение при достижении целевого процента',
        targetPercentage: 'Целевой процент',
        freePlay: 'Свободная игра',
        freePlayDesc: 'Без условий победы - просто играйте!',
        startGame: 'Начать игру',
        startGameWithCount: 'Начать игру ({{count}} овец)',
        tabs: {
            sheep: 'Овцы',
            field: 'Поле',
            rules: 'Правила'
        },
        sizes: {
            small: 'Малое',
            medium: 'Среднее',
            large: 'Большое',
            huge: 'Огромное'
        },
        shapes: {
            square: 'Квадрат',
            wide: 'Широкое',
            tall: 'Высокое',
            lShape: 'L-форма',
            circle: 'Круг',
            diamond: 'Ромб',
            triangle: 'Треугольник',
            custom: 'Своя форма'
        },
        fencePresets: {
            open: 'Открытое поле',
            openDesc: 'Без внутренних заборов',
            corridor: 'Коридор',
            corridorDesc: 'Огороженный путь к воротам',
            funnel: 'Воронка',
            funnelDesc: 'Сужающийся путь к воротам',
            maze: 'Лабиринт',
            mazeDesc: 'Препятствия для прохождения',
            obstacles: 'Препятствия',
            obstaclesDesc: 'Случайные заборы-препятствия',
            custom: 'Своя',
            customDesc: 'Создайте свой макет'
        }
    },

    // Local 2-player mode
    localMode: {
        title: 'Локальная игра на двоих',
        coop: 'Кооператив',
        coopDesc: 'Вместе загоните 200 овец',
        versus: '1 на 1',
        versusDesc: 'Первый до 100 овец побеждает!',
        timed: 'На время',
        timedDesc: '3 минуты - овцы возрождаются!',
        player: 'Игрок',
        controls1: 'WASD + Л.Shift',
        controls2: 'Стрелки + П.Shift',
        startGame: 'Начать игру',
        noLeaderboards: 'Очки в локальном режиме не попадают в таблицу лидеров'
    },

    // Fence editor
    fenceEditor: {
        title: 'Макет заборов',
        fenceCount: '{{count}} забор',
        fenceCountPlural: '{{count}} заборов',
        quickLayouts: 'Быстрые макеты',
        tools: 'Инструменты',
        draw: 'Рисовать',
        select: 'Выбрать',
        erase: 'Стереть',
        pan: 'Перемещение',
        clearAll: 'Очистить всё',
        done: 'Готово',
        dogLabel: 'СОБАКА',
        sheepSpawn: 'Точка появления овец',
        helpDraw: 'Нажмите и тяните для рисования заборов - Сетка 10м',
        helpErase: 'Нажмите на забор, чтобы удалить',
        helpPan: 'Тяните для перемещения - Прокрутка для масштаба',
        helpSelect: 'Нажмите на забор, чтобы выбрать',
        presets: {
            open: 'Чистое поле',
            corridor: 'Направляющий путь',
            funnel: 'Сужение',
            maze: 'Обход препятствий',
            obstacles: 'Случайные блоки'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'Мультиплеер',
        createRoom: 'Создать комнату',
        createRoomDesc: 'Создать новую игровую комнату',
        joinRoom: 'Войти в комнату',
        joinRoomDesc: 'Ввести код комнаты',
        quickMatch: 'Быстрый поиск',
        quickMatchDesc: 'Найти доступную игру',
        maxPlayers: 'Макс. игроков',
        playersCount: '{{count}} игроков',
        gameMode: 'Режим игры',
        cooperative: 'Кооперативный',
        cooperativeDesc: 'Вместе загоните всех овец в загон',
        competitive: 'Соревновательный',
        competitiveDesc: 'Соберите больше овец, чем соперники',
        timed: 'На время (3 мин)',
        timedDesc: 'Наберите максимум очков за 3 минуты',
        roomCode: 'Код комнаты',
        enterRoomCode: 'Введите код комнаты',
        leaveRoom: 'Покинуть комнату',
        startGame: 'Начать игру',
        waitingForPlayers: 'Ожидание игроков...'
    },

    // Lobby
    lobby: {
        title: 'Лобби',
        roomCode: 'Код комнаты',
        playersCount: 'Игроки ({{current}}/{{max}})',
        waitingForMore: 'Ожидание других игроков...'
    },

    // Leaderboard
    leaderboard: {
        title: 'Глобальная таблица лидеров',
        soloClassic: 'Одиночная классика',
        soloExtreme: 'Одиночный экстрим',
        timed: 'На время (3 мин)',
        competitive: 'Соревновательный',
        cooperative: 'Кооперативный',
        updated: 'Обновлено {{time}}',
        loading: 'Загрузка таблицы лидеров...',
        noScores: 'Пока нет записей. Будьте первым!',
        serverOffline: 'Сервер недоступен - Таблица лидеров недоступна. Сервер может запускаться или временно отключён.',
        loadFailed: 'Не удалось загрузить таблицу лидеров. Попробуйте снова.',
        ranks: {
            first: '1-е место',
            second: '2-е место',
            third: '3-е место'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'Овцы',
        stamina: 'Выносливость',
        time: 'Время',
        score: 'Очки',
        timeRemaining: 'Осталось времени',
        complete: 'завершено'
    },

    // Pause menu
    pause: {
        title: 'ПАУЗА',
        tapToResume: 'Нажмите снаружи для продолжения',
        pressEscToResume: 'Нажмите ESC для продолжения',
        resume: 'Продолжить',
        restart: 'Перезапуск',
        mainMenu: 'Главное меню',
        fullscreen: 'Полный экран',
        exitFullscreen: 'Выйти из полноэкр.'
    },

    // Completion screen
    completion: {
        victory: 'Победа!',
        allSheepHerded: 'Все {{count}} овец успешно загнаны!',
        raceComplete: 'Гонка завершена',
        youWon: 'Вы победили!',
        playerWon: '{{name}} победил!',
        timesUp: 'Время вышло',
        timesUpVictory: 'Время вышло - Победа!',
        youCollectedMost: 'Вы собрали больше всех овец!',
        playerCollectedMost: '{{name}} собрал больше всех!',
        teamVictory: 'Командная победа!',
        teamMessage: 'Вместе вы загнали всех овец!',
        gameComplete: 'Игра завершена',
        wellPlayed: 'Отлично сыграно!',
        newPersonalBest: 'НОВЫЙ ЛИЧНЫЙ РЕКОРД!',
        finalStandings: 'Итоговые результаты',
        playAgain: 'Играть снова',
        nextChallenge: 'Следующий уровень',
        stats: {
            time: 'Время',
            yourScore: 'Ваши очки',
            raceTime: 'Время гонки',
            duration: 'Длительность',
            sheepCollected: 'Собрано овец',
            teamTime: 'Время команды'
        },
        sheepUnit: '{{count}} овец'
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'Что-то пошло не так',
        uiError: 'Произошла ошибка интерфейса. Попробуйте обновить страницу.',
        reloadPage: 'Перезагрузить',
        errorDetails: 'Подробности ошибки',
        connectionFailed: 'Не удалось подключиться к серверу мультиплеера.',
        gameNotLoaded: 'Игра не полностью загружена.',
        createRoomFailed: 'Не удалось создать комнату.',
        joinRoomFailed: 'Не удалось войти в комнату',
        noAvailableRooms: 'Нет доступных комнат',
        roomCodeLength: 'Код комнаты должен содержать 6 символов'
    },

    // Welcome / Identity
    identity: {
        welcome: 'Добро пожаловать в Симулятор Пастушьей Собаки!',
        chooseIdentity: 'Выберите, как вас называть:',
        welcomeBack: 'С возвращением, {{name}}!',
        confirmSelection: 'Подтвердить выбор',
        continue: 'Продолжить →',
        settingUp: 'Настройка...',
        customName: 'Своё имя',
        customNameDesc: 'Выберите собственное отображаемое имя',
        enterName: 'Введите ваше имя...',
        randomName: 'Случайное имя',
        randomNameDesc: 'Получить случайно сгенерированное пастушье имя',
        anonymous: 'Остаться анонимным',
        anonymousDesc: 'Играть как "Игрок" без своего имени',
        errorEmpty: 'Пожалуйста, введите отображаемое имя или выберите другой вариант',
        errorTooLong: 'Отображаемое имя должно содержать не более 20 символов',
        errorFailed: 'Не удалось создать личность игрока. Попробуйте снова.'
    }
};
