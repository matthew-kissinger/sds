// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Portuguese (Brazilian) Translations
 * Traduções em Português para Sheep Dog Simulator
 */

export default {
    // Common UI elements
    common: {
        back: 'Voltar',
        backToMenu: '← Voltar ao Menu',
        start: 'Iniciar',
        cancel: 'Cancelar',
        confirm: 'Confirmar',
        save: 'Salvar',
        close: 'Fechar',
        loading: 'Carregando...',
        error: 'Erro',
        retry: 'Tentar Novamente',
        refresh: 'Atualizar',
        copy: 'Copiar',
        copied: 'Copiado!',
        you: 'Você',
        host: 'Anfitrião',
        waiting: 'Aguardando...',
        players: 'Jogadores',
        player: 'Jogador'
    },

    // Main menu / Mode selection
    menu: {
        title: 'Sheep Dog Sim',
        soloPlay: 'Jogar Solo',
        soloPlayDesc: 'Pratique pastoreio no seu ritmo',
        local2Player: '2 Jogadores Local',
        local2PlayerDesc: 'Cooperativo ou competitivo em uma tela',
        sandbox: 'Sandbox',
        sandboxDesc: 'Personalize ovelhas, cercas e regras',
        multiplayer: 'Multijogador',
        multiplayerDesc: 'Compita ou coopere online',
        leaderboard: 'Ranking',
        leaderboardDesc: 'Ver classificações globais',
        settings: 'Configurações',
        settingsDesc: 'Ajustar configurações do jogo'
    },

    // Dog selection
    dogs: {
        title: 'Escolha Seu Cachorro',
        stats: {
            speed: 'Velocidade',
            stamina: 'Resistência',
            control: 'Controle'
        },
        jep: {
            name: 'Jep',
            breed: 'Border Collie',
            description: 'Pastor equilibrado com boa resistência'
        },
        pip: {
            name: 'Pip',
            breed: 'Pastor Australiano',
            description: 'Rápido e ágil, perfeito para pastoreio veloz'
        },
        sally: {
            name: 'Sally',
            breed: 'Welsh Corgi',
            description: 'Ótimo controle mas movimento mais lento'
        },
        shiloh: {
            name: 'Shiloh',
            breed: 'Pastor Alemão',
            description: 'Forte e estável com excelente resistência'
        },
        georgeWashington: {
            name: 'George Washington',
            breed: 'Foxhound Americano',
            description: 'Pastor tático com habilidades equilibradas'
        }
    },

    // Game modes
    modes: {
        title: 'Escolha o Modo de Jogo',
        classic: 'Modo Clássico',
        classicDesc: 'Pastoreie todas as 200 ovelhas para o pasto',
        extreme: 'Modo Extremo',
        extremeDesc: 'Pastoreie 1000 ovelhas - desafio de performance!'
    },

    // Settings panel
    settings: {
        title: 'Configurações',
        performanceMode: 'Modo de Performance',
        performanceOption: 'Performance - FPS Máximo',
        balancedOption: 'Equilibrado - Configurações padrão',
        qualityOption: 'Qualidade - Melhores visuais',
        experimentalWebGpu: 'Renderizador WebGPU',
        experimentalWebGpuDesc: 'Experimental. Usa WebGPU quando disponível; desative para recarregar com WebGL.',
        audioEnabled: 'Áudio Ativado',
        audioVolume: 'Volume do Áudio',
        showStats: 'Mostrar Estatísticas de Performance',
        resetDefaults: 'Restaurar Padrões',
        language: 'Idioma'
    },

    // Sandbox setup
    sandbox: {
        title: 'Configuração Sandbox',
        sheepCount: 'Quantidade de Ovelhas',
        numberOfSheep: 'Número de Ovelhas',
        behavior: 'Comportamento',
        movementSpeed: 'Velocidade de Movimento',
        flockCohesion: 'Coesão do Rebanho',
        separationDistance: 'Distância de Separação',
        fieldSize: 'Tamanho do Campo',
        fieldShape: 'Forma do Campo',
        fenceLayout: 'Layout das Cercas',
        startGame: 'Iniciar Jogo',
        startGameWithCount: 'Iniciar Jogo ({{count}} ovelhas)',
        tabs: {
            sheep: 'Ovelhas',
            field: 'Campo',
            rules: 'Regras'
        },
        sizes: {
            small: 'Pequeno',
            medium: 'Médio',
            large: 'Grande',
            huge: 'Enorme'
        },
        shapes: {
            square: 'Quadrado',
            wide: 'Largo',
            tall: 'Alto',
            lShape: 'Forma L',
            circle: 'Círculo',
            diamond: 'Diamante',
            triangle: 'Triângulo',
            custom: 'Personalizado'
        },
        fencePresets: {
            open: 'Campo Aberto',
            openDesc: 'Sem cercas internas',
            corridor: 'Corredor',
            corridorDesc: 'Caminho cercado até o portão',
            funnel: 'Funil',
            funnelDesc: 'Caminho que se estreita até o portão',
            maze: 'Labirinto',
            mazeDesc: 'Obstáculos para navegar',
            obstacles: 'Obstáculos',
            obstaclesDesc: 'Obstáculos de cerca aleatórios',
            custom: 'Personalizado',
            customDesc: 'Projete seu próprio layout'
        }
    },

    // Local 2-player mode
    localMode: {
        title: '2 Jogadores Local',
        coop: 'Cooperativo',
        coopDesc: 'Trabalhem juntos para pastorear 200 ovelhas',
        versus: 'Corrida 1v1',
        versusDesc: 'O primeiro a 100 ovelhas vence!',
        timed: 'Cronometrado',
        timedDesc: '3 minutos - as ovelhas reaparecem!',
        player: 'Jogador',
        controls1: 'WASD + L.Shift',
        controls2: 'Setas + R.Shift',
        startGame: 'Iniciar Jogo',
        noLeaderboards: 'Pontuações no modo local não são enviadas aos rankings'
    },

    // Fence editor
    fenceEditor: {
        title: 'Layout das Cercas',
        fenceCount: '{{count}} cerca',
        fenceCountPlural: '{{count}} cercas',
        quickLayouts: 'Layouts Rápidos',
        tools: 'Ferramentas',
        draw: 'Desenhar',
        select: 'Selecionar',
        erase: 'Apagar',
        pan: 'Mover',
        clearAll: 'Limpar Tudo',
        done: 'Pronto',
        dogLabel: 'CÃO',
        sheepSpawn: 'Área das Ovelhas',
        helpDraw: 'Clique e arraste para desenhar cercas - Grade de 10m',
        helpErase: 'Clique em uma cerca para deletá-la',
        helpPan: 'Arraste para mover - Scroll para zoom',
        helpSelect: 'Clique em uma cerca para selecioná-la',
        presets: {
            open: 'Campo limpo',
            corridor: 'Caminho guiado',
            funnel: 'Estreitamento',
            maze: 'Navegar obstáculos',
            obstacles: 'Blocos aleatórios'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'Multijogador',
        createRoom: 'Criar Sala',
        createRoomDesc: 'Hospedar uma nova sala de jogo',
        joinRoom: 'Entrar na Sala',
        joinRoomDesc: 'Inserir código da sala',
        quickMatch: 'Partida Rápida',
        quickMatchDesc: 'Encontrar um jogo disponível',
        maxPlayers: 'Máximo de Jogadores',
        playersCount: '{{count}} Jogadores',
        gameMode: 'Modo de Jogo',
        cooperative: 'Cooperativo',
        cooperativeDesc: 'Trabalhem juntos para pastorear todas as ovelhas para o curral',
        competitive: 'Competitivo',
        competitiveDesc: 'Corra para coletar mais ovelhas que os oponentes',
        timed: 'Cronometrado (3 min)',
        timedDesc: 'Consiga o máximo de pontos possível em 3 minutos',
        roomCode: 'Código da Sala',
        enterRoomCode: 'Inserir código da sala',
        leaveRoom: 'Sair da Sala',
        startGame: 'Iniciar Jogo',
        waitingForPlayers: 'Aguardando jogadores...'
    },

    // Lobby
    lobby: {
        title: 'Sala de Espera',
        roomCode: 'Código da Sala',
        playersCount: 'Jogadores ({{current}}/{{max}})',
        waitingForMore: 'Aguardando mais jogadores...'
    },

    // Leaderboard
    leaderboard: {
        title: 'Ranking Global',
        soloClassic: 'Solo Clássico',
        soloExtreme: 'Solo Extremo',
        timed: 'Cronometrado',
        competitive: 'Competitivo',
        cooperative: 'Cooperativo',
        updated: 'Atualizado {{time}}',
        loading: 'Carregando rankings...',
        noScores: 'Nenhuma pontuação registrada ainda. Seja o primeiro!',
        serverOffline: 'Servidor offline - Rankings indisponíveis.',
        loadFailed: 'Falha ao carregar rankings. Por favor, tente novamente.',
        ranks: {
            first: '1º',
            second: '2º',
            third: '3º'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'Ovelhas',
        stamina: 'Resistência',
        time: 'Tempo',
        score: 'Pontuação',
        timeRemaining: 'Tempo Restante',
        complete: 'completo'
    },

    // Pause menu
    pause: {
        title: 'PAUSADO',
        tapToResume: 'Toque fora para continuar',
        pressEscToResume: 'Pressione ESC para continuar',
        resume: 'Continuar',
        restart: 'Reiniciar',
        mainMenu: 'Menu Principal',
        fullscreen: 'Tela Cheia',
        exitFullscreen: 'Sair da Tela Cheia'
    },

    // Completion screen
    completion: {
        victory: 'Vitória!',
        allSheepHerded: 'Todas as {{count}} ovelhas pastoreadas com sucesso!',
        raceComplete: 'Corrida Completa',
        youWon: 'Você venceu a corrida!',
        playerWon: '{{name}} venceu!',
        timesUp: 'Tempo Esgotado',
        timesUpVictory: 'Tempo Esgotado - Vitória!',
        youCollectedMost: 'Você coletou mais ovelhas!',
        playerCollectedMost: '{{name}} coletou mais!',
        teamVictory: 'Vitória da Equipe!',
        teamMessage: 'Trabalhando juntos, vocês pastorearam todas as ovelhas!',
        gameComplete: 'Jogo Completo',
        wellPlayed: 'Bem jogado!',
        newPersonalBest: 'NOVO RECORDE PESSOAL!',
        finalStandings: 'Classificação Final',
        playAgain: 'Jogar Novamente',
        scoreSaved: 'Salvo no placar',
        scoreSaveFailed: 'Não foi possível salvar sua pontuação',
        nextChallenge: 'Próximo Desafio',
        stats: {
            time: 'Tempo',
            yourScore: 'Sua Pontuação',
            raceTime: 'Tempo de Corrida',
            duration: 'Duração',
            sheepCollected: 'Ovelhas Coletadas',
            teamTime: 'Tempo da Equipe'
        },
        sheepUnit: '{{count}} ovelhas'
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'Algo deu errado',
        uiError: 'A interface do jogo encontrou um erro. Tente atualizar a página.',
        reloadPage: 'Recarregar Página',
        errorDetails: 'Detalhes do erro',
        connectionFailed: 'Não foi possível conectar ao servidor multijogador.',
        gameNotLoaded: 'O jogo não foi totalmente carregado.',
        createRoomFailed: 'Falha ao criar sala.',
        joinRoomFailed: 'Falha ao entrar na sala',
        noAvailableRooms: 'Nenhuma sala disponível',
        roomCodeLength: 'O código da sala deve ter 6 caracteres'
    },

    // Welcome / Identity
    identity: {
        welcome: 'Bem-vindo ao Sheep Dog Sim!',
        chooseIdentity: 'Escolha como você quer ser conhecido:',
        welcomeBack: 'Bem-vindo de volta, {{name}}!',
        confirmSelection: 'Confirmar Seleção',
        nameUpdated: 'Nome atualizado',
        continue: 'Continuar →',
        settingUp: 'Configurando...',
        customName: 'Nome Personalizado',
        customNameDesc: 'Escolha seu próprio nome de exibição',
        enterName: 'Digite seu nome...',
        randomName: 'Nome Aleatório',
        randomNameDesc: 'Obter um nome aleatório com tema de pastoreio',
        anonymous: 'Permanecer Anônimo',
        anonymousDesc: 'Jogar como "Jogador" sem nome personalizado',
        errorEmpty: 'Por favor, digite um nome de exibição ou escolha outra opção',
        errorTooLong: 'O nome de exibição deve ter 20 caracteres ou menos',
        errorFailed: 'Falha ao criar identidade do jogador. Tente novamente.'
    }
};
