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

    // Settings panel
    settings: {
        title: 'Ajustes',
        performanceMode: 'Modo de Rendimiento',
        performanceOption: 'Rendimiento - FPS Máximo',
        balancedOption: 'Equilibrado - Configuración predeterminada',
        qualityOption: 'Calidad - Mejores visuales',
        experimentalWebGpu: 'Renderizador WebGPU',
        experimentalWebGpuDesc: 'Experimental. Usa WebGPU cuando esté disponible; desactívalo para recargar con WebGL.',
        audioEnabled: 'Audio Activado',
        audioVolume: 'Volumen de Audio',
        showStats: 'Mostrar Estadísticas de Rendimiento',
        resetDefaults: 'Restaurar Valores Predeterminados',
        language: 'Idioma'
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
        waitingForMore: 'Esperando más jugadores...'
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
        nextChallenge: 'Siguiente Desafío',
        stats: {
            time: 'Tiempo',
            yourScore: 'Tu Puntuación',
            raceTime: 'Tiempo de Carrera',
            duration: 'Duración',
            sheepCollected: 'Ovejas Recogidas',
            teamTime: 'Tiempo del Equipo'
        },
        sheepUnit: '{{count}} ovejas'
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
    }
};
