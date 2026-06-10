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

    // Practice Paddock (Cycle 26 v2.1.0)
    practice: {
        hint: 'WASD ou setas para mover · Shift para correr'
    },

    // Tutorial de primeira jogada (P1-TUTORIAL): cartão de oferta + instruções durante a partida.
    tutorial: {
        offerTitle: 'Primeira vez pastoreando?',
        offerBody: 'Faça uma partida guiada de 60 segundos em Home Field. Mova-se, corra, troque a câmera e leve 3 ovelhas ao curral.',
        offerStart: 'Me mostre',
        offerSkip: 'Não, obrigado',
        skip: 'Pular tutorial',
        herdProgress: '{{penned}} de {{goal}} no curral',
        step: {
            move: 'Mova seu cão com WASD ou as setas.',
            moveTouch: 'Arraste o joystick para mover seu cão.',
            sprint: 'Segure Shift para correr. Correr gasta resistência.',
            sprintTouch: 'Segure o botão de corrida para um impulso de velocidade. Ele gasta resistência.',
            camera: 'Pressione C para mudar a visão da câmera.',
            cameraTouch: 'Toque no botão de câmera no topo para mudar a visão.',
            herd: 'Leve 3 ovelhas pelo portão até o curral. Fique atrás do rebanho; as ovelhas fogem de você.',
            done: 'Três no curral. Agora você conhece o trabalho. O resto do rebanho é seu.'
        }
    },

    // Game modes
    modes: {
        title: 'Escolha o Modo de Jogo',
        practice: 'Só Jogar',
        practiceDesc: 'Sem cronômetro. Só 30 ovelhas. Vá no seu ritmo.',
        classic: 'Modo Clássico',
        classicDesc: 'Pastoreie todas as 200 ovelhas para o pasto',
        extreme: 'Modo Extremo',
        extremeDesc: 'Pastoreie 1000 ovelhas - desafio de performance!',
        insane: 'Modo Insano',
        insaneDesc: 'Pastoreie todas as 3000 ovelhas - desafio extremo!',
        chaos: 'Modo Caos',
        chaosDesc: 'Pastoreie todas as 5000 ovelhas - loucura total!'
    },

    // P1-MOBILE-WARN: aviso de desempenho antes da rodada em dispositivos móveis.
    mobileWarning: {
        title: 'Um rebanho grande para este aparelho',
        body: '{{sheep}} ovelhas é muito para um celular ou tablet. Pode haver queda de quadros. Você pode continuar, ou voltar e escolher um rebanho menor.',
        continue: 'Continuar mesmo assim',
        goBack: 'Voltar'
    },

    // P1-MOBILE-FALLBACK: aviso de renderização de compatibilidade (WebGPU -> WebGL).
    rendererFallback: {
        title: 'Renderização de compatibilidade',
        body: 'Este navegador usa o renderizador WebGL. O jogo funciona igual; alguns detalhes visuais são reduzidos.'
    },

    // P4-CTX-RESTORE: aviso ao perder o contexto gráfico, antes da recarga automática.
    contextLost: {
        title: 'Contexto gráfico perdido',
        body: 'Reiniciando o renderizador. O jogo será recarregado em instantes.'
    },

    // P4-SW-TOAST: aviso persistente quando um novo service worker assume o controle.
    swUpdate: {
        ready: 'Uma nova versão está pronta.'
    },

    // Settings panel
    settings: {
        title: 'Configurações',
        tabs: {
            graphics: 'Gráficos',
            audio: 'Áudio',
            controls: 'Controles',
            general: 'Geral'
        },
        presets: 'Predefinição de Desempenho',
        performanceMode: 'Modo de Performance',
        performanceOption: 'Performance - FPS Máximo',
        balancedOption: 'Equilibrado - Configurações padrão',
        qualityOption: 'Qualidade - Melhores visuais',
        shadows: 'Sombras',
        shadowsDesc: 'Ativar sombras dinâmicas (somente desktop)',
        experimentalWebGpu: 'Renderizador WebGPU',
        experimentalWebGpuDesc: 'Experimental. Usa WebGPU quando disponível; desative para recarregar com WebGL.',
        rendererDiagnostics: 'Estado do renderizador',
        shadowQuality: 'Qualidade das Sombras',
        low: 'Baixa',
        medium: 'Média',
        high: 'Alta',
        audioEnabled: 'Áudio Ativado',
        audioVolume: 'Volume do Áudio',
        showStats: 'Mostrar Estatísticas de Performance',
        showStatsDesc: 'Mostrar FPS e estatísticas de renderização',
        keyBindings: 'Controles do Teclado',
        resetBindings: 'Restaurar Padrão',
        pressKey: 'Pressione uma tecla...',
        keyConflict: 'A tecla já é usada para {{action}}',
        actions: {
            moveUp: 'Avançar',
            moveDown: 'Recuar',
            moveLeft: 'Mover para a Esquerda',
            moveRight: 'Mover para a Direita',
            sprint: 'Correr',
            bark: 'Latir',
            cameraCycle: 'Alternar Câmera',
            pause: 'Pausar',
            zoomIn: 'Aproximar',
            zoomOut: 'Afastar',
            bank: 'Guardar Pontos',
            note: 'Abrir Nota',
            moveX: 'Mover (horizontal)',
            moveY: 'Mover (vertical)'
        },
        cameraModeSection: 'Modo de câmera (pressione {{key}} para alternar)',
        cameraModes: {
            follow: 'Seguir',
            followDesc: 'Close cinematográfico atrás do cão (padrão)',
            free: 'Livre',
            freeDesc: 'Arraste com o botão direito para orbitar o cão',
            classic: 'Clássica',
            classicDesc: 'Vista isométrica elevada'
        },
        gamepadSupport: 'Suporte a Controle',
        gamepadDesc: 'Controles são detectados automaticamente. Use o analógico esquerdo para mover e os gatilhos para correr.',
        // Gamepad config ([P4-GAMEPAD-UI])
        gamepadDeadzone: 'Zona morta do analógico',
        gamepadDeadzoneDesc: 'A entrada do analógico abaixo deste valor é ignorada',
        stickPreview: 'Entrada do analógico (após a zona morta)',
        gamepadButtons: 'Botões do Controle',
        gamepadAxes: 'Eixos de Movimento do Analógico',
        pressButton: 'Pressione um botão...',
        moveAxis: 'Mova um analógico...',
        axisLabel: 'Eixo {{index}}',
        padConflict: 'Botão já usado para {{action}}',
        axisConflict: 'Eixo já usado para {{action}}',
        resetDefaults: 'Restaurar Padrões',
        language: 'Idioma',
        accessibility: 'Acessibilidade',
        colorblindMode: 'Cores para daltônicos',
        colorblindModeDesc: 'Usa uma paleta segura para daltônicos em medalhas e classificações',
        tutorialLabel: 'Tutorial',
        tutorialDesc: 'Refaça a lição guiada de pastoreio',
        replayTutorial: 'Repetir tutorial',
        profile: 'Perfil do Jogador',
        resetProfile: 'Redefinir perfil',
        resetProfileDesc: 'Apaga a identidade local do jogador. Uma nova é criada ao recarregar; estatísticas e teclas permanecem.',
        resetProfileConfirm: 'Redefinir seu perfil de jogador? Uma nova identidade de pastor será criada ao recarregar o jogo.',
        aboutLink: 'Sobre este jogo'
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
        editFenceLayout: 'Editar Layout das Cercas',
        editCustomShape: 'Editar Forma Personalizada',
        drawCustomShape: 'Desenhar Forma Personalizada',
        timer: 'Cronômetro',
        enableTimer: 'Ativar Cronômetro',
        countUp: 'Contagem Progressiva',
        countUpDesc: 'Registre seu tempo',
        countdown: 'Contagem Regressiva',
        countdownDesc: 'Corrida contra o tempo',
        timeLimit: 'Limite de Tempo',
        winCondition: 'Condição de Vitória',
        herdAllSheep: 'Pastorear Todas as Ovelhas',
        herdAllSheepDesc: 'Conclusão clássica - todas as ovelhas no pasto',
        percentageGoal: 'Meta de Porcentagem',
        percentageGoalDesc: 'Conclui ao atingir a porcentagem alvo',
        targetPercentage: 'Porcentagem Alvo',
        freePlay: 'Jogo Livre',
        freePlayDesc: 'Sem condição de vitória - apenas jogue!',
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
        publicLobbies: 'Salas Públicas',
        publicLobbiesDesc: 'Ver jogos abertos',
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
        survival: 'Sobrevivência (cooperativo)',
        survivalDesc: 'Levem o rebanho para casa antes do anoitecer e sobrevivam juntos à noite dos lobos. Perder um terço do rebanho encerra a partida.',
        // P1-MOBILE-WARN: aviso para um anfitrião móvel que escolhe mais de 1000 ovelhas.
        mobileHostHighSheep: 'Este aparelho é móvel. Salas com mais de 1000 ovelhas só admitem jogadores de desktop, então você não poderá entrar na sala que criar.',
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
        waitingForMore: 'Aguardando mais jogadores...',
        // [P1-SHARE] copy-invite-link affordance.
        copyInviteLink: 'Copiar link de convite',
        inviteLinkCopied: 'Link copiado'
    },

    // Leaderboard
    leaderboard: {
        title: 'Ranking Global',
        soloClassic: 'Solo Clássico',
        soloExtreme: 'Solo Extremo',
        soloInsane: 'Solo Insano',
        soloChaos: 'Solo Caos',
        timed: 'Cronometrado',
        competitive: 'Competitivo',
        cooperative: 'Cooperativo',
        // Cycle 59 (Counting Sheep): abas por curva.
        countingIncremental: 'Contagem Incremental',
        countingExponential: 'Contagem Exponencial',
        // Cycle 66: ranking de sobrevivência de Newsheepdogland.
        survival: 'Sobrevivência',
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
        complete: 'completo',
        // Cycle 59 (Counting Sheep): indicador de rodadas no HUD.
        counting: {
            round: 'Rodada',
            bank: 'Guardar e encerrar'
        }
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
        exitFullscreen: 'Sair da Tela Cheia',
        // Cycle 59 (Counting Sheep): opção de guardar no menu de pausa.
        bankAndFinish: 'Guardar e encerrar'
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
        saveClip: 'Salvar clipe de desenvolvimento',
        stats: {
            time: 'Tempo',
            yourScore: 'Sua Pontuação',
            raceTime: 'Tempo de Corrida',
            duration: 'Duração',
            sheepCollected: 'Ovelhas Coletadas',
            teamTime: 'Tempo da Equipe'
        },
        sheepUnit: '{{count}} ovelhas',
        // [P1-SHARE] completion share button + Web Share / clipboard payload.
        share: {
            button: 'Compartilhar',
            copied: 'Copiado',
            title: 'Sheep Dog Sim',
            single: 'Levei {{count}} ovelhas ao cercado em {{time}} no Sheep Dog Sim.',
            counting: 'Contei {{count}} ovelhas e cheguei à rodada {{round}} no Sheep Dog Sim.',
            mpWin: 'Venci uma partida multijogador com {{count}} ovelhas no Sheep Dog Sim.',
            mpScore: 'Cerquei {{count}} ovelhas em uma partida multijogador no Sheep Dog Sim.',
            cooperative: 'Levamos {{count}} ovelhas em equipe no Sheep Dog Sim.',
            generic: 'Joguei uma partida de Sheep Dog Sim.'
        },
        // Cycle 59 (Counting Sheep): resumo ao guardar a partida.
        counting: {
            title: 'Ovelhas contadas',
            subtitle: 'Você contou {{count}} antes de guardar a partida.',
            counted: 'Contadas',
            round: 'Rodada alcançada'
        }
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
    },

    // [P3-ACHIEVE-DATA] Conquistas: nomes e descrições.
    achievements: {
        // [P3-ACHIEVE-UI] Interface: aviso de desbloqueio e lista do menu.
        ui: {
            toastTitle: 'Conquista desbloqueada',
            panelTitle: 'Conquistas',
            summary: '{{unlocked}} de {{total}} desbloqueadas',
            locked: 'Bloqueada',
            unlockedOn: 'Desbloqueada em {{date}}'
        },
        firstPen: {
            name: 'Primeiro curral',
            desc: 'Leve seu primeiro rebanho completo ao curral.'
        },
        pen200HomeField: {
            name: 'Clássico em Home Field',
            desc: 'Leve as 200 ovelhas do Clássico solo ao curral em Home Field.'
        },
        pen200RollingHills: {
            name: 'Clássico em Rolling Hills',
            desc: 'Leve o rebanho Clássico de 75 ovelhas ao curral em Rolling Hills.'
        },
        pen200OpenCountry: {
            name: 'Clássico em Open Country',
            desc: 'Leve o rebanho Clássico de 50 ovelhas ao curral em Open Country.'
        },
        chaos5000: {
            name: 'Pastor do caos',
            desc: 'Leve 5.000 ovelhas ao curral no Caos solo.'
        },
        allFiveDogs: {
            name: 'Canil completo',
            desc: 'Complete uma rodada solo com cada um dos cinco cães.'
        },
        surviveFirstNight: {
            name: 'Primeira noite',
            desc: 'Sobreviva à sua primeira noite em Newsheepdogland.'
        },
        survive5Nights: {
            name: 'Cinco noites',
            desc: 'Sobreviva 5 noites em uma única partida em Newsheepdogland.'
        },
        winCompetitiveRoom: {
            name: 'Cão alfa',
            desc: 'Vença uma sala multijogador competitiva.'
        }
    }
};
