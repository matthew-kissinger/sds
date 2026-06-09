// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Spanish Translations
 * Traducciones en español para Sheep Dog Simulator
 */

export default {
    // Common UI elements
    common: {
        back: 'Atrás',
        backToMenu: '← Volver al Menú',
        start: 'Iniciar',
        cancel: 'Cancelar',
        confirm: 'Confirmar',
        save: 'Guardar',
        close: 'Cerrar',
        loading: 'Cargando...',
        error: 'Error',
        retry: 'Reintentar',
        refresh: 'Actualizar',
        copy: 'Copiar',
        copied: '¡Copiado!',
        you: 'Tú',
        host: 'Anfitrión',
        waiting: 'Esperando...',
        players: 'Jugadores',
        player: 'Jugador'
    },

    // Main menu / Mode selection
    menu: {
        title: 'Sheep Dog Sim',
        soloPlay: 'Jugar Solo',
        soloPlayDesc: 'Practica el pastoreo a tu ritmo',
        local2Player: '2 Jugadores Local',
        local2PlayerDesc: 'Cooperativo o competitivo en una pantalla',
        sandbox: 'Sandbox',
        sandboxDesc: 'Personaliza ovejas, cercas y reglas',
        multiplayer: 'Multijugador',
        multiplayerDesc: 'Compite o coopera en línea',
        leaderboard: 'Clasificación',
        leaderboardDesc: 'Ver rankings globales',
        settings: 'Ajustes',
        settingsDesc: 'Configurar opciones del juego'
    },

    // Dog selection
    dogs: {
        title: 'Elige Tu Perro',
        stats: {
            speed: 'Velocidad',
            stamina: 'Resistencia',
            control: 'Control'
        },
        jep: {
            name: 'Jep',
            breed: 'Border Collie',
            description: 'Pastor equilibrado con buena resistencia'
        },
        pip: {
            name: 'Pip',
            breed: 'Pastor Australiano',
            description: 'Rápido y ágil, perfecto para pastoreo veloz'
        },
        sally: {
            name: 'Sally',
            breed: 'Welsh Corgi',
            description: 'Gran control pero movimiento más lento'
        },
        shiloh: {
            name: 'Shiloh',
            breed: 'Pastor Alemán',
            description: 'Fuerte y constante con excelente resistencia'
        },
        georgeWashington: {
            name: 'George Washington',
            breed: 'Foxhound Americano',
            description: 'Pastor táctico con habilidades equilibradas'
        }
    },

    // Game modes
    modes: {
        title: 'Elige el Modo de Juego',
        classic: 'Modo Clásico',
        classicDesc: 'Pastorea las 200 ovejas al pasto',
        extreme: 'Modo Extremo',
        extremeDesc: '¡Pastorea 1000 ovejas - desafío de rendimiento!'
    },

    // P1-MOBILE-WARN: aviso de rendimiento previo a la partida en móviles.
    mobileWarning: {
        title: 'Un rebaño grande para este dispositivo',
        body: '{{sheep}} ovejas son muchas para un teléfono o una tableta. Pueden perderse fotogramas. Puedes continuar, o volver y elegir un rebaño más pequeño.',
        continue: 'Continuar igualmente',
        goBack: 'Volver'
    },

    // P1-MOBILE-FALLBACK: aviso de renderizado de compatibilidad (WebGPU -> WebGL).
    rendererFallback: {
        title: 'Renderizado de compatibilidad',
        body: 'Este navegador usa el renderizador WebGL. El juego funciona igual; algunos detalles visuales se reducen.'
    },

    // Settings panel
    settings: {
        title: 'Ajustes',
        tabs: {
            graphics: 'Gráficos',
            audio: 'Audio',
            controls: 'Controles',
            general: 'General'
        },
        presets: 'Preajuste de Rendimiento',
        performanceMode: 'Modo de Rendimiento',
        performanceOption: 'Rendimiento - FPS Máximo',
        balancedOption: 'Equilibrado - Configuración predeterminada',
        qualityOption: 'Calidad - Mejores visuales',
        shadows: 'Sombras',
        shadowsDesc: 'Activar sombras dinámicas (solo escritorio)',
        experimentalWebGpu: 'Renderizador WebGPU',
        experimentalWebGpuDesc: 'Experimental. Usa WebGPU cuando esté disponible; desactívalo para recargar con WebGL.',
        shadowQuality: 'Calidad de Sombras',
        low: 'Baja',
        medium: 'Media',
        high: 'Alta',
        audioEnabled: 'Audio Activado',
        audioVolume: 'Volumen de Audio',
        showStats: 'Mostrar Estadísticas de Rendimiento',
        showStatsDesc: 'Mostrar FPS y estadísticas de renderizado',
        keyBindings: 'Controles de Teclado',
        resetBindings: 'Restablecer Valores',
        pressKey: 'Pulsa una tecla...',
        keyConflict: 'La tecla ya se usa para {{action}}',
        actions: {
            moveUp: 'Avanzar',
            moveDown: 'Retroceder',
            moveLeft: 'Mover a la Izquierda',
            moveRight: 'Mover a la Derecha',
            sprint: 'Esprintar',
            bark: 'Ladrar',
            cameraCycle: 'Cambiar Cámara',
            pause: 'Pausa'
        },
        cameraModeSection: 'Modo de cámara (pulsa {{key}} para cambiar)',
        cameraModes: {
            follow: 'Seguimiento',
            followDesc: 'Primer plano cinematográfico detrás del perro (predeterminado)',
            free: 'Libre',
            freeDesc: 'Arrastra con el botón derecho para orbitar al perro',
            classic: 'Clásica',
            classicDesc: 'Vista isométrica elevada'
        },
        gamepadSupport: 'Compatibilidad con Mando',
        gamepadDesc: 'Los mandos se detectan automáticamente. Usa el stick izquierdo para moverte y los gatillos para esprintar.',
        resetDefaults: 'Restaurar Valores Predeterminados',
        language: 'Idioma',
        accessibility: 'Accesibilidad',
        colorblindMode: 'Colores aptos para daltónicos',
        colorblindModeDesc: 'Usa una paleta segura para daltónicos en medallas y rangos',
        tutorialLabel: 'Tutorial',
        tutorialDesc: 'Vuelve a hacer la lección guiada de pastoreo',
        replayTutorial: 'Repetir tutorial',
        profile: 'Perfil de Jugador',
        resetProfile: 'Restablecer perfil',
        resetProfileDesc: 'Borra la identidad local del jugador. Se crea una nueva al recargar; las estadísticas y los controles se conservan.',
        resetProfileConfirm: '¿Restablecer tu perfil de jugador? Se creará una nueva identidad de pastor al recargar el juego.',
        aboutLink: 'Acerca de este juego'
    },

    // Sandbox setup
    sandbox: {
        title: 'Configuración Sandbox',
        sheepCount: 'Cantidad de Ovejas',
        numberOfSheep: 'Número de Ovejas',
        behavior: 'Comportamiento',
        movementSpeed: 'Velocidad de Movimiento',
        flockCohesion: 'Cohesión del Rebaño',
        separationDistance: 'Distancia de Separación',
        fieldSize: 'Tamaño del Campo',
        fieldShape: 'Forma del Campo',
        fenceLayout: 'Diseño de Cercas',
        editFenceLayout: 'Editar Diseño de Cercas',
        editCustomShape: 'Editar Forma Personalizada',
        drawCustomShape: 'Dibujar Forma Personalizada',
        timer: 'Temporizador',
        enableTimer: 'Activar Temporizador',
        countUp: 'Contar Hacia Arriba',
        countUpDesc: 'Registra tu tiempo',
        countdown: 'Cuenta Regresiva',
        countdownDesc: 'Carrera contra el tiempo',
        timeLimit: 'Límite de Tiempo',
        winCondition: 'Condición de Victoria',
        herdAllSheep: 'Pastorear Todas las Ovejas',
        herdAllSheepDesc: 'Completar clásico - todas las ovejas al pasto',
        percentageGoal: 'Meta de Porcentaje',
        percentageGoalDesc: 'Completar al alcanzar el porcentaje objetivo',
        targetPercentage: 'Porcentaje Objetivo',
        freePlay: 'Juego Libre',
        freePlayDesc: 'Sin condición de victoria - ¡solo juega!',
        startGame: 'Iniciar Juego',
        startGameWithCount: 'Iniciar Juego ({{count}} ovejas)',
        tabs: {
            sheep: 'Ovejas',
            field: 'Campo',
            rules: 'Reglas'
        },
        sizes: {
            small: 'Pequeño',
            medium: 'Mediano',
            large: 'Grande',
            huge: 'Enorme'
        },
        shapes: {
            square: 'Cuadrado',
            wide: 'Ancho',
            tall: 'Alto',
            lShape: 'Forma L',
            circle: 'Círculo',
            diamond: 'Diamante',
            triangle: 'Triángulo',
            custom: 'Personalizado'
        },
        fencePresets: {
            open: 'Campo Abierto',
            openDesc: 'Sin cercas internas',
            corridor: 'Corredor',
            corridorDesc: 'Camino cercado hacia la puerta',
            funnel: 'Embudo',
            funnelDesc: 'Camino que se estrecha hacia la puerta',
            maze: 'Laberinto',
            mazeDesc: 'Obstáculos para navegar',
            obstacles: 'Obstáculos',
            obstaclesDesc: 'Obstáculos de cerca aleatorios',
            custom: 'Personalizado',
            customDesc: 'Diseña tu propio diseño'
        }
    },

    // Local 2-player mode
    localMode: {
        title: '2 Jugadores Local',
        coop: 'Cooperativo',
        coopDesc: 'Trabajen juntos para pastorear 200 ovejas',
        versus: 'Carrera 1v1',
        versusDesc: '¡El primero en 100 ovejas gana!',
        timed: 'Cronometrado',
        timedDesc: '3 minutos - ¡las ovejas reaparecen!',
        player: 'Jugador',
        controls1: 'WASD + L.Shift',
        controls2: 'Flechas + R.Shift',
        startGame: 'Iniciar Juego',
        noLeaderboards: 'Las puntuaciones en modo local no se envían a las clasificaciones'
    },

    // Fence editor
    fenceEditor: {
        title: 'Diseño de Cercas',
        fenceCount: '{{count}} cerca',
        fenceCountPlural: '{{count}} cercas',
        quickLayouts: 'Diseños Rápidos',
        tools: 'Herramientas',
        draw: 'Dibujar',
        select: 'Seleccionar',
        erase: 'Borrar',
        pan: 'Mover',
        clearAll: 'Limpiar Todo',
        done: 'Listo',
        dogLabel: 'PERRO',
        sheepSpawn: 'Zona de Ovejas',
        helpDraw: 'Clic y arrastrar para dibujar cercas - Ajuste a cuadrícula de 10m',
        helpErase: 'Clic en una cerca para eliminarla',
        helpPan: 'Arrastrar para mover - Scroll para zoom',
        helpSelect: 'Clic en una cerca para seleccionarla',
        presets: {
            open: 'Campo despejado',
            corridor: 'Camino guiado',
            funnel: 'Estrechamiento',
            maze: 'Navegar obstáculos',
            obstacles: 'Bloques aleatorios'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'Multijugador',
        createRoom: 'Crear Sala',
        createRoomDesc: 'Ser anfitrión de una nueva sala',
        joinRoom: 'Unirse a Sala',
        joinRoomDesc: 'Introducir código de sala',
        quickMatch: 'Partida Rápida',
        quickMatchDesc: 'Encontrar una partida disponible',
        maxPlayers: 'Jugadores Máximos',
        playersCount: '{{count}} Jugadores',
        gameMode: 'Modo de Juego',
        cooperative: 'Cooperativo',
        cooperativeDesc: 'Trabajen juntos para pastorear todas las ovejas al corral',
        competitive: 'Competitivo',
        competitiveDesc: 'Compite por recoger más ovejas que los oponentes',
        timed: 'Cronometrado (3 min)',
        timedDesc: 'Consigue tantos puntos como sea posible en 3 minutos',
        // P1-MOBILE-WARN: aviso para un anfitrión móvil que elige más de 1000 ovejas.
        mobileHostHighSheep: 'Este dispositivo es móvil. Las salas con más de 1000 ovejas solo admiten jugadores de escritorio, así que no podrás unirte a la sala que crees.',
        roomCode: 'Código de Sala',
        enterRoomCode: 'Introducir código de sala',
        leaveRoom: 'Salir de la Sala',
        startGame: 'Iniciar Juego',
        waitingForPlayers: 'Esperando jugadores...'
    },

    // Lobby
    lobby: {
        title: 'Sala de Espera',
        roomCode: 'Código de Sala',
        playersCount: 'Jugadores ({{current}}/{{max}})',
        waitingForMore: 'Esperando más jugadores...',
        // [P1-SHARE] copy-invite-link affordance.
        copyInviteLink: 'Copiar enlace de invitación',
        inviteLinkCopied: 'Enlace copiado'
    },

    // Leaderboard
    leaderboard: {
        title: 'Clasificación Global',
        soloClassic: 'Solo Clásico',
        soloExtreme: 'Solo Extremo',
        timed: 'Cronometrado (3 min)',
        competitive: 'Competitivo',
        cooperative: 'Cooperativo',
        updated: 'Actualizado {{time}}',
        loading: 'Cargando clasificaciones...',
        noScores: '¡Aún no hay puntuaciones. ¡Sé el primero!',
        serverOffline: 'Servidor desconectado - Clasificaciones no disponibles. El servidor puede estar iniciando o temporalmente inactivo.',
        loadFailed: 'Error al cargar clasificaciones. Por favor, inténtalo de nuevo.',
        ranks: {
            first: '1º',
            second: '2º',
            third: '3º'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'Ovejas',
        stamina: 'Resistencia',
        time: 'Tiempo',
        score: 'Puntuación',
        timeRemaining: 'Tiempo Restante',
        complete: 'completo'
    },

    // Pause menu
    pause: {
        title: 'PAUSADO',
        tapToResume: 'Toca fuera para continuar',
        pressEscToResume: 'Presiona ESC para continuar',
        resume: 'Continuar',
        restart: 'Reiniciar',
        mainMenu: 'Menú Principal',
        fullscreen: 'Pantalla Completa',
        exitFullscreen: 'Salir de Pantalla Completa'
    },

    // Completion screen
    completion: {
        victory: '¡Victoria!',
        allSheepHerded: '¡Todas las {{count}} ovejas pastoreadas exitosamente!',
        raceComplete: 'Carrera Completada',
        youWon: '¡Ganaste la carrera!',
        playerWon: '¡{{name}} ganó!',
        timesUp: 'Tiempo Agotado',
        timesUpVictory: 'Tiempo Agotado - ¡Victoria!',
        youCollectedMost: '¡Recogiste más ovejas!',
        playerCollectedMost: '¡{{name}} recogió más!',
        teamVictory: '¡Victoria del Equipo!',
        teamMessage: '¡Trabajando juntos, pastorearon todas las ovejas!',
        gameComplete: 'Juego Completado',
        wellPlayed: '¡Bien jugado!',
        newPersonalBest: '¡NUEVO RÉCORD PERSONAL!',
        finalStandings: 'Clasificación Final',
        playAgain: 'Jugar de Nuevo',
        scoreSaved: 'Guardado en la clasificación',
        scoreSaveFailed: 'No se pudo guardar tu puntuación',
        nextChallenge: 'Siguiente Desafío',
        stats: {
            time: 'Tiempo',
            yourScore: 'Tu Puntuación',
            raceTime: 'Tiempo de Carrera',
            duration: 'Duración',
            sheepCollected: 'Ovejas Recogidas',
            teamTime: 'Tiempo del Equipo'
        },
        sheepUnit: '{{count}} ovejas',
        // [P1-SHARE] completion share button + Web Share / clipboard payload.
        share: {
            button: 'Compartir',
            copied: 'Copiado',
            title: 'Sheep Dog Sim',
            single: 'Llevé {{count}} ovejas al corral en {{time}} en Sheep Dog Sim.',
            counting: 'Conté {{count}} ovejas y llegué a la ronda {{round}} en Sheep Dog Sim.',
            mpWin: 'Gané una partida multijugador con {{count}} ovejas en Sheep Dog Sim.',
            mpScore: 'Encerré {{count}} ovejas en una partida multijugador en Sheep Dog Sim.',
            cooperative: 'Llevamos {{count}} ovejas en equipo en Sheep Dog Sim.',
            generic: 'Terminé una partida de Sheep Dog Sim.'
        }
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'Algo salió mal',
        uiError: 'La interfaz del juego encontró un error. Intenta actualizar la página.',
        reloadPage: 'Recargar Página',
        errorDetails: 'Detalles del error',
        connectionFailed: 'No se pudo conectar al servidor multijugador.',
        gameNotLoaded: 'El juego no se ha cargado completamente.',
        createRoomFailed: 'Error al crear la sala.',
        joinRoomFailed: 'Error al unirse a la sala',
        noAvailableRooms: 'No hay salas disponibles',
        roomCodeLength: 'El código de sala debe tener 6 caracteres'
    },

    // Welcome / Identity
    identity: {
        welcome: '¡Bienvenido a Sheep Dog Sim!',
        chooseIdentity: 'Elige cómo quieres ser conocido:',
        welcomeBack: '¡Bienvenido de nuevo, {{name}}!',
        confirmSelection: 'Confirmar Selección',
        nameUpdated: 'Nombre actualizado',
        continue: 'Continuar →',
        settingUp: 'Configurando...',
        customName: 'Nombre Personalizado',
        customNameDesc: 'Elige tu propio nombre',
        enterName: 'Ingresa tu nombre...',
        randomName: 'Nombre Aleatorio',
        randomNameDesc: 'Obtén un nombre temático de pastoreo generado aleatoriamente',
        anonymous: 'Permanecer Anónimo',
        anonymousDesc: 'Juega como "Jugador" sin nombre personalizado',
        errorEmpty: 'Por favor ingresa un nombre o elige otra opción',
        errorTooLong: 'El nombre debe tener 20 caracteres o menos',
        errorFailed: 'Error al crear identidad. Por favor intenta de nuevo.'
    },

    // [P3-ACHIEVE-DATA] Logros: nombres y descripciones.
    achievements: {
        // [P3-ACHIEVE-UI] Interfaz: aviso de desbloqueo y lista del menú.
        ui: {
            toastTitle: 'Logro desbloqueado',
            panelTitle: 'Logros',
            summary: '{{unlocked}} de {{total}} desbloqueados',
            locked: 'Bloqueado',
            unlockedOn: 'Desbloqueado el {{date}}'
        },
        firstPen: {
            name: 'Primer corral',
            desc: 'Encierra tu primer rebaño completo.'
        },
        pen200HomeField: {
            name: 'Clásico en Home Field',
            desc: 'Encierra las 200 ovejas del Clásico en solitario en Home Field.'
        },
        pen200RollingHills: {
            name: 'Clásico en Rolling Hills',
            desc: 'Encierra el rebaño Clásico de 75 ovejas en Rolling Hills.'
        },
        pen200OpenCountry: {
            name: 'Clásico en Open Country',
            desc: 'Encierra el rebaño Clásico de 50 ovejas en Open Country.'
        },
        chaos5000: {
            name: 'Pastor del caos',
            desc: 'Encierra 5.000 ovejas en Caos en solitario.'
        },
        allFiveDogs: {
            name: 'Perrera completa',
            desc: 'Completa una ronda en solitario con cada uno de los cinco perros.'
        },
        surviveFirstNight: {
            name: 'Primera noche',
            desc: 'Sobrevive tu primera noche en Newsheepdogland.'
        },
        survive5Nights: {
            name: 'Cinco noches',
            desc: 'Sobrevive 5 noches en una sola partida en Newsheepdogland.'
        },
        winCompetitiveRoom: {
            name: 'Perro alfa',
            desc: 'Gana una sala multijugador competitiva.'
        }
    }
};
