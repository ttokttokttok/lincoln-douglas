import { GraduationCap, Flame, Swords, Sprout, Check } from 'lucide-react';
import type { BotCharacter, BotDifficulty } from '@shared/types';

interface BotCharacterCardProps {
  id: BotCharacter;
  name: string;
  description: string;
  difficulty: BotDifficulty;
  isSelected: boolean;
  onSelect: (id: BotCharacter) => void;
}

const DIFFICULTY_COLORS: Record<BotDifficulty, string> = {
  easy: 'text-green-400 bg-green-500/20',
  medium: 'text-yellow-400 bg-yellow-500/20',
  hard: 'text-red-400 bg-red-500/20',
};

const DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

const CHARACTER_ICONS: Record<BotCharacter, React.ReactNode> = {
  scholar: <GraduationCap className="w-8 h-8" />,
  passionate: <Flame className="w-8 h-8" />,
  aggressive: <Swords className="w-8 h-8" />,
  beginner: <Sprout className="w-8 h-8" />,
};

const CHARACTER_COLORS: Record<BotCharacter, string> = {
  scholar: 'border-blue-500 bg-blue-500/10',
  passionate: 'border-orange-500 bg-orange-500/10',
  aggressive: 'border-red-500 bg-red-500/10',
  beginner: 'border-green-500 bg-green-500/10',
};

const CHARACTER_ICON_COLORS: Record<BotCharacter, string> = {
  scholar: 'text-blue-400',
  passionate: 'text-orange-400',
  aggressive: 'text-red-400',
  beginner: 'text-green-400',
};

export function BotCharacterCard({
  id,
  name,
  description,
  difficulty,
  isSelected,
  onSelect,
}: BotCharacterCardProps) {
  return (
    <div
      onClick={() => onSelect(id)}
      className={`relative cursor-pointer rounded-xl border-2 p-4 transition-all duration-200
        ${isSelected
          ? `${CHARACTER_COLORS[id]} shadow-lg`
          : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
        }`}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2">
          <div className={`p-1 rounded-full ${CHARACTER_COLORS[id].replace('border-', 'bg-').replace('/10', '/30')}`}>
            <Check className={`w-4 h-4 ${CHARACTER_ICON_COLORS[id]}`} />
          </div>
        </div>
      )}

      {/* Icon and name */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${CHARACTER_COLORS[id].replace('border-', 'bg-').replace('/10', '/20')}`}>
          <span className={CHARACTER_ICON_COLORS[id]}>
            {CHARACTER_ICONS[id]}
          </span>
        </div>
        <div>
          <h3 className="font-semibold text-white">{name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[difficulty]}`}>
            {DIFFICULTY_LABELS[difficulty]}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-400">{description}</p>
    </div>
  );
}
