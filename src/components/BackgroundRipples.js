import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "../utils/cn";

export const BackgroundRipples = ({ className }) => {
  // State to track window dimensions
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  });
  
  // State for ripples and mouse position
  const [ripples, setRipples] = useState([]);
  const rippleCount = useRef(0);
  const [mousePosition, setMousePosition] = useState({ 
    x: typeof window !== "undefined" ? window.innerWidth / 2 : 0, 
    y: typeof window !== "undefined" ? window.innerHeight / 2 : 0 
  });
  
  // Performance settings - increased limits for more visual ripples
  const MAX_RIPPLES = 12; // Increased maximum ripple count
  const isLowPerfDevice = useRef(false); // Will be set based on device detection
  
  // Ripple generation settings
  const minRippleSize = windowSize.width < 768 ? 80 : 150;
  const maxRippleSize = windowSize.width < 768 ? 250 : 400;
  const minDuration = 7; // Longer duration
  const maxDuration = 12; // Longer duration
  
  // SVG viewBox dimensions
  const getViewBox = () => {
    const aspectRatio = windowSize.width / windowSize.height;
    
    if (aspectRatio < 1) {
      // Portrait orientation (mobile)
      return "0 0 1000 1500";
    } else if (aspectRatio < 1.5) {
      // Square-ish screens (tablets)
      return "0 0 1200 1000";
    } else {
      // Landscape orientation (desktop)
      return "0 0 1500 800";
    }
  };
  
  const [viewBox, setViewBox] = useState(getViewBox());
  
  // Update dimensions on window resize and track mouse position
  useEffect(() => {
    // Skip in SSR context
    if (typeof window === "undefined") return;
    
    // Device performance detection
    // Check for low performance indicators: older mobile devices, low memory, etc.
    const detectLowPerformance = () => {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isOldIOS = /iPhone OS ([0-9])_/i.test(navigator.userAgent) && RegExp.$1 < 12;
      const isOldAndroid = /Android ([0-9])\./i.test(navigator.userAgent) && RegExp.$1 < 8;
      const isLowRAM = navigator.deviceMemory && navigator.deviceMemory < 4;
      const isLowCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4;
      
      // If any of these are true, consider it a low performance device
      isLowPerfDevice.current = isMobile && (isOldIOS || isOldAndroid || isLowRAM || isLowCores);
    };
    
    detectLowPerformance();
    
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setViewBox(getViewBox());
    };
    
    // Throttled mouse move handler to reduce processing load
    let mouseThrottleTimeout;
    const throttleDelay = isLowPerfDevice.current ? 100 : 50; // Higher throttle on low-end devices
    
    const handleMouseMove = (e) => {
      // Skip processing if we're throttling
      if (mouseThrottleTimeout) {
        return;
      }
      
      mouseThrottleTimeout = setTimeout(() => {
        mouseThrottleTimeout = null;
      }, throttleDelay);
      
      // Get mouse position relative to the section
      const bioSection = document.getElementById('bio');
      if (!bioSection) return;
      
      const rect = bioSection.getBoundingClientRect();
      
      // Calculate mouse position relative to the section
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Only update if mouse is inside the section
      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        setMousePosition({ x, y });
      }
    };
    
    // Set initial values
    handleResize();
    
    // Add event listeners
    window.addEventListener("resize", handleResize);
    document.addEventListener("mousemove", handleMouseMove);
    
    // Handle touch events for mobile (with reduced sensitivity for performance)
    let touchThrottleTimeout;
    const handleTouchMove = (e) => {
      // Skip processing if we're throttling
      if (touchThrottleTimeout) {
        return;
      }
      
      touchThrottleTimeout = setTimeout(() => {
        touchThrottleTimeout = null;
      }, throttleDelay * 2); // Even stronger throttling for touch
      
      if (e.touches && e.touches[0]) {
        const touch = e.touches[0];
        handleMouseMove({
          clientX: touch.clientX,
          clientY: touch.clientY
        });
      }
    };
    
    document.addEventListener("touchmove", handleTouchMove);
    
    // Clean up
    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("touchmove", handleTouchMove);
      clearTimeout(mouseThrottleTimeout);
      clearTimeout(touchThrottleTimeout);
    };
  }, []);
  
  // Generate random color
  const getRandomColor = () => {
    const r = Math.floor(Math.random() * 255);
    const g = Math.floor(Math.random() * 255);
    const b = Math.floor(Math.random() * 255);
    return `rgb(${r}, ${g}, ${b})`;
  };
  
  // Generate a rainbow gradient from a random starting hue
  const generateRainbowGradient = (fixedCount) => {
    // Number of colors in the gradient
    // If fixedCount is provided, use that, otherwise 4-6 colors for a smooth rainbow progression
    const colorCount = fixedCount || (Math.floor(Math.random() * 3) + 4); // 4 to 6 colors by default
    
    // Random starting hue
    const startHue = Math.floor(Math.random() * 360); // 0-359
    
    // Array to hold our colors
    const colors = [];
    
    // Create a rainbow sequence starting from the random hue
    for (let i = 0; i < colorCount; i++) {
      // Calculate the hue using spectrum progression
      // Each step moves approximately 1/6 of the way around the color wheel
      // This gives us the ROYGBIV rainbow progression regardless of starting point
      const hueStep = (360 / colorCount);
      const hue = (startHue + i * hueStep) % 360;
      
      // Consistent saturation and lightness for a true rainbow look
      const saturation = 70 + Math.floor(Math.random() * 30); // 70-100% for vibrant colors
      const lightness = 60 + Math.floor(Math.random() * 15); // 60-75% for pastel-like colors
      
      colors.push({
        offset: `${(i / (colorCount - 1)) * 100}%`,
        color: `hsl(${hue}, ${saturation}%, ${lightness}%)`
      });
    }
    
    return colors;
  };
  
  // Generate a new ripple at mouse position
  const generateRipple = () => {
    // Check if we already have the maximum number of ripples
    if (ripples.length >= MAX_RIPPLES) {
      // If at max, don't create a new one
      return;
    }
    
    // Adjust ripple complexity based on device performance
    // Restore original ring count for fuller effect
    const maxRings = isLowPerfDevice.current ? 2 : 3; // Standard ring count
    
    // Position based on mouse location with slight randomization
    // Add a small random offset (±20 pixels) for natural feel
    const offsetX = (Math.random() - 0.5) * 40;
    const offsetY = (Math.random() - 0.5) * 40;
    
    // Use mouse position with the random offset
    const x = mousePosition.x + offsetX;
    const y = mousePosition.y + offsetY;
    
    // Transform to SVG coordinates
    const svgX = (x / windowSize.width) * parseInt(viewBox.split(" ")[2]);
    const svgY = (y / windowSize.height) * parseInt(viewBox.split(" ")[3]);
    
    // Random size (smaller on low-perf devices)
    const performanceScaleFactor = isLowPerfDevice.current ? 0.7 : 1;
    const size = (Math.random() * (maxRippleSize - minRippleSize) + minRippleSize) * performanceScaleFactor;
    
    // Random animation duration (faster on low-perf devices to reduce active animations)
    const duration = isLowPerfDevice.current 
      ? Math.random() * 2 + 3 // 3-5 seconds on low-perf
      : Math.random() * (maxDuration - minDuration) + minDuration; // Normal duration otherwise
    
    // Rainbow gradient colors (fewer stops on low-perf devices)
    const gradientColors = generateRainbowGradient(isLowPerfDevice.current ? 3 : undefined);
    
    // Generate a unique ID for this ripple
    const id = rippleCount.current++;
    
    // Add new ripple with performance info
    setRipples(prev => [...prev, { 
      id, 
      x: svgX, 
      y: svgY, 
      size, 
      duration,
      gradientColors,
      maxRings, // Store how many rings this ripple should have
      createdAt: Date.now() // Track when created for prioritization
    }]);
    
    // Remove ripple after it completes
    setTimeout(() => {
      setRipples(prev => prev.filter(ripple => ripple.id !== id));
    }, duration * 1000 + 100); // Add small buffer to ensure animation completes
  };
  
  // Generate ripples on mouse move with reduced throttling for more ripples
  useEffect(() => {
    // Adjust throttling based on device performance, but much less aggressive
    const baseThrottleDelay = isLowPerfDevice.current ? 700 : 350; // Much shorter delays
    let lastRippleTime = 0;
    
    const throttledGenerateRipple = () => {
      const now = Date.now();
      
      // If we're at max ripples, always remove the oldest one to make room
      if (ripples.length >= MAX_RIPPLES) {
        // Find the oldest ripple
        let oldestRipple = ripples.reduce((oldest, current) => 
          current.createdAt < oldest.createdAt ? current : oldest, 
          ripples[0]);
          
        if (oldestRipple) {
          // Remove the oldest ripple to make room
          setRipples(prev => prev.filter(ripple => ripple.id !== oldestRipple.id));
        }
      }
      
      // Check time since last ripple
      if (now - lastRippleTime > baseThrottleDelay) {
        // Lower skip chance for more frequent ripples
        const skipChance = isLowPerfDevice.current ? 0.4 : 0.2;
        
        // Much lower skip chance to increase frequency
        if (Math.random() >= skipChance) {
          generateRipple();
        }
        
        lastRippleTime = now;
      }
    };
    
    // Reduced movement threshold for more responsive ripple generation
    const minMoveThreshold = isLowPerfDevice.current ? 5 : 2; // Much smaller movement threshold
    let lastX = mousePosition.x;
    let lastY = mousePosition.y;
    
    const handleMousePositionChange = () => {
      const distance = Math.sqrt(
        Math.pow(mousePosition.x - lastX, 2) + Math.pow(mousePosition.y - lastY, 2)
      );
      
      // More sensitive to movement
      if (distance > minMoveThreshold) {
        throttledGenerateRipple();
        lastX = mousePosition.x;
        lastY = mousePosition.y;
      }
    };
    
    // More frequent checks for mouse movement
    const moveCheckInterval = setInterval(
      handleMousePositionChange, 
      isLowPerfDevice.current ? 100 : 50 // More frequent checking
    );
    
    // Create multiple initial ripples for immediate visual feedback
    if (ripples.length === 0) {
      // Stagger initial ripples for a more natural look
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          generateRipple();
        }, 200 * i);
      }
    }
    
    return () => {
      clearInterval(moveCheckInterval);
    };
  }, [mousePosition, windowSize, ripples.length]);
  
  return (
    <div
      className={cn(
        "absolute h-full w-full inset-0 z-0 overflow-hidden",
        className
      )}
    >
      <svg
        className="z-0 h-full w-full pointer-events-none absolute"
        width="100%"
        height="100%"
        viewBox={viewBox}
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          opacity: 0.6, // Slightly more subtle
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      >
        {/* Render all active ripples */}
        {ripples.map(ripple => (
          <g key={ripple.id}>
            {/* Generate concentric circles for each ripple with ring count based on performance */}
            {Array.from({ length: ripple.maxRings || 3 }).map((_, ringIndex) => (
              <motion.circle
                key={`${ripple.id}-${ringIndex}`}
                cx={ripple.x}
                cy={ripple.y}
                r={0}
                stroke={`url(#rippleGradient-${ripple.id}-${ringIndex})`}
                strokeWidth={8} // Four times as thick as original
                strokeOpacity={0.6} // Slightly more visible
                fill="none"
                initial={{ r: 0, strokeOpacity: 0.7 }}
                animate={{
                  r: ripple.size * ringIndex,
                  strokeOpacity: 0,
                }}
                transition={{
                  duration: ripple.duration * (1 + ringIndex * 0.1), // Slight timing variance between rings
                  ease: "easeOut",
                }}
              />
            ))}
            
            {/* Gradients for each ring */}
            {Array.from({ length: ripple.maxRings || 3 }).map((_, ringIndex) => (
              <defs key={`gradient-${ripple.id}-${ringIndex}`}>
                <linearGradient
                  id={`rippleGradient-${ripple.id}-${ringIndex}`}
                  gradientUnits="userSpaceOnUse"
                  gradientTransform={`rotate(${((ripple.id * 30) + ringIndex * 120) % 360} ${ripple.x} ${ripple.y})`}
                >
                  {ripple.gradientColors.map((color, index) => (
                    <stop key={index} offset={color.offset} stopColor={color.color} />
                  ))}
                </linearGradient>
              </defs>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
};