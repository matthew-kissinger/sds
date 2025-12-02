/**
 * French Translations
 * Traductions françaises pour Sheep Dog Simulator
 */

export default {
    // Common UI elements
    common: {
        back: 'Retour',
        backToMenu: '← Retour au Menu',
        start: 'Démarrer',
        cancel: 'Annuler',
        confirm: 'Confirmer',
        save: 'Sauvegarder',
        close: 'Fermer',
        loading: 'Chargement...',
        error: 'Erreur',
        retry: 'Réessayer',
        refresh: 'Actualiser',
        copy: 'Copier',
        copied: 'Copié !',
        you: 'Vous',
        host: 'Hôte',
        waiting: 'En attente...',
        players: 'Joueurs',
        player: 'Joueur'
    },

    // Main menu / Mode selection
    menu: {
        title: 'Sheep Dog Sim',
        soloPlay: 'Jouer Solo',
        soloPlayDesc: 'Entraînez-vous à votre rythme',
        local2Player: '2 Joueurs Local',
        local2PlayerDesc: 'Coop ou compétition sur un écran',
        sandbox: 'Bac à Sable',
        sandboxDesc: 'Personnalisez moutons, clôtures et règles',
        multiplayer: 'Multijoueur',
        multiplayerDesc: 'Affrontez ou coopérez en ligne',
        leaderboard: 'Classement',
        leaderboardDesc: 'Voir les classements mondiaux',
        settings: 'Paramètres',
        settingsDesc: 'Ajuster les paramètres du jeu'
    },

    // Dog selection
    dogs: {
        title: 'Choisissez Votre Chien',
        stats: {
            speed: 'Vitesse',
            stamina: 'Endurance',
            control: 'Contrôle'
        },
        jep: {
            name: 'Jep',
            breed: 'Border Collie',
            description: 'Berger équilibré avec une bonne endurance'
        },
        pip: {
            name: 'Pip',
            breed: 'Berger Australien',
            description: 'Rapide et agile, parfait pour le rassemblement rapide'
        },
        sally: {
            name: 'Sally',
            breed: 'Welsh Corgi',
            description: 'Excellent contrôle mais mouvement plus lent'
        },
        shiloh: {
            name: 'Shiloh',
            breed: 'Berger Allemand',
            description: 'Fort et stable avec une excellente endurance'
        },
        georgeWashington: {
            name: 'George Washington',
            breed: 'Foxhound Américain',
            description: 'Berger tactique avec des capacités équilibrées'
        }
    },

    // Game modes
    modes: {
        title: 'Choisir le Mode de Jeu',
        classic: 'Mode Classique',
        classicDesc: 'Rassemblez les 200 moutons vers le pâturage',
        extreme: 'Mode Extrême',
        extremeDesc: 'Rassemblez 1000 moutons - défi de performance !'
    },

    // Settings panel
    settings: {
        title: 'Paramètres',
        performanceMode: 'Mode Performance',
        performanceOption: 'Performance - FPS Maximum',
        balancedOption: 'Équilibré - Paramètres par défaut',
        qualityOption: 'Qualité - Meilleurs visuels',
        audioEnabled: 'Audio Activé',
        audioVolume: 'Volume Audio',
        showStats: 'Afficher les Stats de Performance',
        resetDefaults: 'Réinitialiser par Défaut',
        language: 'Langue'
    },

    // Sandbox setup
    sandbox: {
        title: 'Configuration Bac à Sable',
        sheepCount: 'Nombre de Moutons',
        numberOfSheep: 'Nombre de Moutons',
        behavior: 'Comportement',
        movementSpeed: 'Vitesse de Déplacement',
        flockCohesion: 'Cohésion du Troupeau',
        separationDistance: 'Distance de Séparation',
        fieldSize: 'Taille du Champ',
        fieldShape: 'Forme du Champ',
        fenceLayout: 'Disposition des Clôtures',
        startGame: 'Démarrer le Jeu',
        startGameWithCount: 'Démarrer ({{count}} moutons)',
        tabs: {
            sheep: 'Moutons',
            field: 'Champ',
            rules: 'Règles'
        },
        sizes: {
            small: 'Petit',
            medium: 'Moyen',
            large: 'Grand',
            huge: 'Énorme'
        },
        shapes: {
            square: 'Carré',
            wide: 'Large',
            tall: 'Haut',
            lShape: 'Forme L',
            circle: 'Cercle',
            diamond: 'Losange',
            triangle: 'Triangle',
            custom: 'Personnalisé'
        },
        fencePresets: {
            open: 'Champ Ouvert',
            openDesc: 'Pas de clôtures internes',
            corridor: 'Couloir',
            corridorDesc: 'Chemin clôturé vers le portail',
            funnel: 'Entonnoir',
            funnelDesc: 'Chemin se rétrécissant vers le portail',
            maze: 'Labyrinthe',
            mazeDesc: 'Obstacles à naviguer',
            obstacles: 'Obstacles',
            obstaclesDesc: 'Obstacles de clôture aléatoires',
            custom: 'Personnalisé',
            customDesc: 'Concevez votre propre disposition'
        }
    },

    // Local 2-player mode
    localMode: {
        title: '2 Joueurs Local',
        coop: 'Coop',
        coopDesc: 'Travaillez ensemble pour rassembler 200 moutons',
        versus: 'Course 1v1',
        versusDesc: 'Le premier à 100 moutons gagne !',
        timed: 'Chronométré',
        timedDesc: '3 minutes - les moutons réapparaissent !',
        player: 'Joueur',
        controls1: 'ZQSD + L.Shift',
        controls2: 'Flèches + R.Shift',
        startGame: 'Démarrer le Jeu',
        noLeaderboards: 'Les scores en mode local ne sont pas envoyés aux classements'
    },

    // Fence editor
    fenceEditor: {
        title: 'Disposition des Clôtures',
        fenceCount: '{{count}} clôture',
        fenceCountPlural: '{{count}} clôtures',
        quickLayouts: 'Dispositions Rapides',
        tools: 'Outils',
        draw: 'Dessiner',
        select: 'Sélectionner',
        erase: 'Effacer',
        pan: 'Déplacer',
        clearAll: 'Tout Effacer',
        done: 'Terminé',
        dogLabel: 'CHIEN',
        sheepSpawn: 'Apparition Moutons',
        helpDraw: 'Cliquez et glissez pour dessiner - Grille de 10m',
        helpErase: 'Cliquez sur une clôture pour la supprimer',
        helpPan: 'Glissez pour déplacer - Scroll pour zoomer',
        helpSelect: 'Cliquez sur une clôture pour la sélectionner',
        presets: {
            open: 'Champ libre',
            corridor: 'Chemin guidé',
            funnel: 'Rétrécissement',
            maze: 'Naviguer obstacles',
            obstacles: 'Blocs aléatoires'
        }
    },

    // Multiplayer
    multiplayer: {
        title: 'Multijoueur',
        createRoom: 'Créer une Salle',
        createRoomDesc: 'Héberger une nouvelle salle de jeu',
        joinRoom: 'Rejoindre une Salle',
        joinRoomDesc: 'Entrer le code de la salle',
        quickMatch: 'Partie Rapide',
        quickMatchDesc: 'Trouver une partie disponible',
        maxPlayers: 'Joueurs Max',
        playersCount: '{{count}} Joueurs',
        gameMode: 'Mode de Jeu',
        cooperative: 'Coopératif',
        cooperativeDesc: 'Travaillez ensemble pour rassembler tous les moutons',
        competitive: 'Compétitif',
        competitiveDesc: 'Course pour collecter le plus de moutons',
        timed: 'Chronométré (3 min)',
        timedDesc: 'Marquez le plus de points possible en 3 minutes',
        roomCode: 'Code de la Salle',
        enterRoomCode: 'Entrer le code de la salle',
        leaveRoom: 'Quitter la Salle',
        startGame: 'Démarrer le Jeu',
        waitingForPlayers: 'En attente de joueurs...'
    },

    // Lobby
    lobby: {
        title: 'Salon de Jeu',
        roomCode: 'Code de la Salle',
        playersCount: 'Joueurs ({{current}}/{{max}})',
        waitingForMore: 'En attente de plus de joueurs...'
    },

    // Leaderboard
    leaderboard: {
        title: 'Classement Mondial',
        soloClassic: 'Solo Classique',
        soloExtreme: 'Solo Extrême',
        timed: 'Chronométré',
        competitive: 'Compétitif',
        cooperative: 'Coopératif',
        updated: 'Mis à jour {{time}}',
        loading: 'Chargement des classements...',
        noScores: 'Aucun score enregistré. Soyez le premier !',
        serverOffline: 'Serveur hors ligne - Classements indisponibles.',
        loadFailed: 'Échec du chargement. Veuillez réessayer.',
        ranks: {
            first: '1er',
            second: '2ème',
            third: '3ème'
        }
    },

    // Game HUD
    hud: {
        sheepCount: 'Moutons',
        stamina: 'Endurance',
        time: 'Temps',
        score: 'Score',
        timeRemaining: 'Temps Restant',
        complete: 'terminé'
    },

    // Pause menu
    pause: {
        title: 'PAUSE',
        tapToResume: 'Touchez à l\'extérieur pour reprendre',
        pressEscToResume: 'Appuyez sur ÉCHAP pour reprendre',
        resume: 'Reprendre',
        restart: 'Recommencer',
        mainMenu: 'Menu Principal',
        fullscreen: 'Plein Écran',
        exitFullscreen: 'Quitter Plein Écran'
    },

    // Completion screen
    completion: {
        victory: 'Victoire !',
        allSheepHerded: 'Les {{count}} moutons rassemblés avec succès !',
        raceComplete: 'Course Terminée',
        youWon: 'Vous avez gagné la course !',
        playerWon: '{{name}} a gagné !',
        timesUp: 'Temps Écoulé',
        timesUpVictory: 'Temps Écoulé - Victoire !',
        youCollectedMost: 'Vous avez collecté le plus de moutons !',
        playerCollectedMost: '{{name}} a collecté le plus !',
        teamVictory: 'Victoire d\'Équipe !',
        teamMessage: 'Ensemble, vous avez rassemblé tous les moutons !',
        gameComplete: 'Partie Terminée',
        wellPlayed: 'Bien joué !',
        newPersonalBest: 'NOUVEAU RECORD PERSONNEL !',
        finalStandings: 'Classement Final',
        playAgain: 'Rejouer',
        nextChallenge: 'Défi Suivant',
        stats: {
            time: 'Temps',
            yourScore: 'Votre Score',
            raceTime: 'Temps de Course',
            duration: 'Durée',
            sheepCollected: 'Moutons Collectés',
            teamTime: 'Temps d\'Équipe'
        },
        sheepUnit: '{{count}} moutons'
    },

    // Errors and alerts
    errors: {
        somethingWrong: 'Une erreur s\'est produite',
        uiError: 'L\'interface du jeu a rencontré une erreur. Essayez de rafraîchir la page.',
        reloadPage: 'Recharger la Page',
        errorDetails: 'Détails de l\'erreur',
        connectionFailed: 'Impossible de se connecter au serveur multijoueur.',
        gameNotLoaded: 'Le jeu n\'est pas complètement chargé.',
        createRoomFailed: 'Échec de la création de la salle.',
        joinRoomFailed: 'Échec de la connexion à la salle',
        noAvailableRooms: 'Aucune salle disponible',
        roomCodeLength: 'Le code de la salle doit comporter 6 caractères'
    },

    // Welcome / Identity
    identity: {
        welcome: 'Bienvenue sur Sheep Dog Sim !',
        chooseIdentity: 'Choisissez comment vous souhaitez être connu :',
        welcomeBack: 'Bon retour, {{name}} !',
        confirmSelection: 'Confirmer la Sélection',
        continue: 'Continuer →',
        settingUp: 'Configuration...',
        customName: 'Nom Personnalisé',
        customNameDesc: 'Choisissez votre propre nom d\'affichage',
        enterName: 'Entrez votre nom...',
        randomName: 'Nom Aléatoire',
        randomNameDesc: 'Obtenir un nom généré aléatoirement sur le thème du berger',
        anonymous: 'Rester Anonyme',
        anonymousDesc: 'Jouer en tant que "Joueur" sans nom personnalisé',
        errorEmpty: 'Veuillez entrer un nom d\'affichage ou choisir une autre option',
        errorTooLong: 'Le nom d\'affichage doit contenir 20 caractères ou moins',
        errorFailed: 'Échec de la création de l\'identité du joueur. Veuillez réessayer.'
    }
};
