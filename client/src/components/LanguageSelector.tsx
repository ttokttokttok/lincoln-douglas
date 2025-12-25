/**
 * LanguageSelector Component
 * 
 * Searchable dropdown for selecting languages.
 * Supports 70+ languages that Gemini can handle.
 */

import { useState, useRef, useEffect } from 'react';
import { LANGUAGES, type LanguageCode, type LanguageInfo } from '@shared/types';

interface LanguageSelectorProps {
  value: LanguageCode;
  onChange: (code: LanguageCode) => void;
  label: string;
  disabled?: boolean;
}

export function LanguageSelector({ value, onChange, label, disabled }: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Find the currently selected language
  const selectedLang = LANGUAGES.find(l => l.code === value) || LANGUAGES[0];

  // Filter languages based on search
  const filteredLanguages = LANGUAGES.filter(lang => {
    const searchLower = search.toLowerCase();
    return (
      lang.name.toLowerCase().includes(searchLower) ||
      lang.nativeName.toLowerCase().includes(searchLower) ||
      lang.code.toLowerCase().includes(searchLower)
    );
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (lang: LanguageInfo) => {
    onChange(lang.code);
    setIsOpen(false);
    setSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    } else if (e.key === 'Enter' && filteredLanguages.length > 0) {
      handleSelect(filteredLanguages[0]);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Label */}
      <p className="text-sm text-gray-400 mb-1">{label}</p>

      {/* Selected Language Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center gap-2 px-3 py-2 rounded-lg
          bg-gray-700 border border-gray-600
          hover:bg-gray-600 hover:border-gray-500
          transition-colors text-left
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${isOpen ? 'ring-2 ring-blue-500' : ''}
        `}
      >
        <span className="text-lg">{selectedLang.flag}</span>
        <span className="flex-1 text-white">{selectedLang.name}</span>
        <span className="text-xs text-gray-400">{selectedLang.nativeName}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-700">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search languages..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Language List */}
          <div className="max-h-64 overflow-y-auto">
            {filteredLanguages.length === 0 ? (
              <div className="px-3 py-4 text-gray-500 text-sm text-center">
                No languages found
              </div>
            ) : (
              filteredLanguages.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleSelect(lang)}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2
                    hover:bg-gray-700 transition-colors text-left
                    ${lang.code === value ? 'bg-blue-500/20 text-blue-300' : 'text-white'}
                  `}
                >
                  <span className="text-lg w-6">{lang.flag}</span>
                  <span className="flex-1">{lang.name}</span>
                  <span className="text-xs text-gray-400">{lang.nativeName}</span>
                  {lang.code === value && (
                    <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Language count */}
          <div className="px-3 py-2 border-t border-gray-700 text-xs text-gray-500 text-center">
            {filteredLanguages.length} of {LANGUAGES.length} languages
          </div>
        </div>
      )}
    </div>
  );
}

