import { motion } from 'framer-motion';

const dogs = [
  {
    id: 'jep',
    name: 'Jep',
    breed: 'Border Collie',
    emoji: '🐕‍🦺',
    description: 'Balanced herding specialist',
    stats: {
      speed: 3,
      stamina: 3,
      range: 3
    }
  },
  {
    id: 'rauri',
    name: 'Rauri',
    breed: 'Australian Shepherd',
    emoji: '🐕',
    description: 'Powerful with extended range',
    stats: {
      speed: 3,
      stamina: 2,
      range: 5
    }
  },
  {
    id: 'pip',
    name: 'Pip',
    breed: 'Corgi',
    emoji: '🐶',
    description: 'Fast and agile, short range',
    stats: {
      speed: 5,
      stamina: 4,
      range: 2
    }
  }
];

const StatBar = ({ value, max = 5 }) => (
  <div className="flex gap-1">
    {Array.from({ length: max }, (_, i) => (
      <div
        key={i}
        className={`w-2 h-2 rounded-full ${
          i < value ? 'bg-blue-400' : 'bg-gray-600'
        }`}
      />
    ))}
  </div>
);

const DogCard = ({ dog, isSelected, onSelect, index }) => (
  <motion.div
    className={`
      relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-300
      ${isSelected 
        ? 'border-blue-400 bg-blue-500/20 shadow-lg shadow-blue-500/25' 
        : 'border-white/20 bg-white/10 hover:border-white/40 hover:bg-white/15'
      }
    `}
    onClick={() => onSelect(dog.id)}
    initial={{ y: 30, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    transition={{ duration: 0.5, delay: index * 0.1 }}
    whileHover={{ y: -5, scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
  >
    {/* Selection indicator */}
    {isSelected && (
      <motion.div
        className="absolute -top-2 -right-2 w-6 h-6 bg-blue-400 rounded-full flex items-center justify-center"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        <span className="text-xs">✓</span>
      </motion.div>
    )}
    
    {/* Dog Avatar */}
    <div className="text-center mb-3">
      <div className="text-5xl mb-2">{dog.emoji}</div>
      <h4 className="text-xl font-bold text-white">{dog.name}</h4>
      <p className="text-blue-300 text-sm font-medium">{dog.breed}</p>
    </div>
    
    {/* Description */}
    <p className="text-white/80 text-sm text-center mb-4">
      {dog.description}
    </p>
    
    {/* Stats */}
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-white/70 text-xs">Speed:</span>
        <StatBar value={dog.stats.speed} />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-white/70 text-xs">Stamina:</span>
        <StatBar value={dog.stats.stamina} />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-white/70 text-xs">Range:</span>
        <StatBar value={dog.stats.range} />
      </div>
    </div>
  </motion.div>
);

const DogSelector = ({ selectedDog, onSelectDog }) => {
  return (
    <motion.div
      className="ui-panel"
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8 }}
    >
      <h3 className="text-center text-blue-400 text-xl font-bold mb-6">
        Choose Your Dog
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
        {dogs.map((dog, index) => (
          <DogCard
            key={dog.id}
            dog={dog}
            isSelected={selectedDog === dog.id}
            onSelect={onSelectDog}
            index={index}
          />
        ))}
      </div>
      
      {/* Selected dog preview */}
      <motion.div
        className="mt-6 text-center"
        key={selectedDog}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <p className="text-white/70 text-sm">
          Selected: <span className="text-blue-400 font-semibold">
            {dogs.find(d => d.id === selectedDog)?.name}
          </span>
        </p>
      </motion.div>
    </motion.div>
  );
};

export default DogSelector;