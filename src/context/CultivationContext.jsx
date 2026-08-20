import React, { createContext, useContext, useState, useCallback } from 'react';
import { useCultivation as useCultivationHook } from '../hooks/useCultivation';

const CultivationContext = createContext(null);

export const CultivationProvider = ({ children }) => {
  const cultivationData = useCultivationHook();

  // Add focus mode state globally so Header and Layout can respond
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Add selected node state globally so Visualizer and SidePanel can share
  const [selectedNode, setSelectedNode] = useState(null);

  // Add filter state globally
  const [activeMeridian, setActiveMeridian] = useState('all');

  // Add active realm view state (allows previewing other realms from timeline)
  const [activeRealmView, setActiveRealmView] = useState(null);

  // Add gallery modal state globally so SidePanelInfo and Visualizer can toggle Bach Than Do
  const [galleryModalOpen, setGalleryModalOpen] = useState(false);

  // Add anchor modal palace state globally so Palace clicks and SidePanel can open Khảm Nạm Modal
  const [anchorModalPalace, setAnchorModalPalace] = useState(null);

  const toggleFocusMode = useCallback(() => {
    setIsFocusMode(prev => !prev);
  }, []);

  const value = {
    ...cultivationData,
    isFocusMode,
    toggleFocusMode,
    selectedNode,
    setSelectedNode,
    activeMeridian,
    setActiveMeridian,
    activeRealmView,
    setActiveRealmView,
    galleryModalOpen,
    setGalleryModalOpen,
    anchorModalPalace,
    setAnchorModalPalace,
  };

  return (
    <CultivationContext.Provider value={value}>
      {children}
    </CultivationContext.Provider>
  );
};

export const useCultivationContext = () => {
  const context = useContext(CultivationContext);
  if (!context) {
    throw new Error('useCultivationContext must be used within a CultivationProvider');
  }
  return context;
};
