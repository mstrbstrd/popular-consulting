import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "../utils/cn";

export const BackgroundBeams = ({ className }) => {
  // State to track window dimensions
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  });

  // Path selection based on screen size - significantly reduced for better performance
  const getPathsForScreenSize = () => {
    const isSmallScreen = windowSize.width < 768;
    const isMediumScreen = windowSize.width >= 768 && windowSize.width < 1200;

    // Create paths with performance in mind
    const createOptimizedPaths = () => {
      // Reduced set of paths - only about 25% of the original count but with increased thickness
      const mobilePaths = [
        "M-380 -189C-380 -189 -312 216 152 343C616 470 684 1600 684 1600",
        "M-359 -213C-359 -213 -291 192 173 319C637 446 705 1600 705 1600",
        "M-338 -237C-338 -237 -270 168 194 295C658 422 726 1600 726 1600",
        "M-317 -261C-317 -261 -249 144 215 271C679 398 747 1600 747 1600",
        "M-296 -285C-296 -285 -228 120 236 247C700 374 768 1600 768 1600",
        "M-275 -309C-275 -309 -207 96 257 223C721 350 789 1600 789 1600",
        "M-254 -333C-254 -333 -186 72 278 199C742 326 810 1600 810 1600",
        "M-233 -357C-233 -357 -165 48 299 175C763 302 831 1600 831 1600",
        "M-212 -381C-212 -381 -144 24 320 151C784 278 852 1600 852 1600",
        "M-191 -405C-191 -405 -123 0 341 127C805 254 873 1600 873 1600",
        "M-170 -429C-170 -429 -102 -24 362 103C826 230 894 1600 894 1600",
        "M-149 -453C-149 -453 -81 -48 383 79C847 206 915 1600 915 1600",
        "M-128 -477C-128 -477 -60 -72 404 55C868 182 936 1600 936 1600",
        "M-107 -501C-107 -501 -39 -96 425 31C889 158 957 1600 957 1600",
        "M-86 -525C-86 -525 -18 -120 446 7C910 134 978 1600 978 1600",
        "M-65 -549C-65 -549 3 -144 467 -17C931 110 999 1600 999 1600",
        "M-44 -573C-44 -573 24 -168 488 -41C952 86 1020 1600 1020 1600",
      ];
      
      // For desktop, use shorter paths
      const desktopPaths = [
        "M-380 -189C-380 -189 -312 216 152 343C616 470 684 875 684 875",
        "M-359 -213C-359 -213 -291 192 173 319C637 446 705 851 705 851",
        "M-338 -237C-338 -237 -270 168 194 295C658 422 726 827 726 827",
        "M-317 -261C-317 -261 -249 144 215 271C679 398 747 803 747 803",
        "M-296 -285C-296 -285 -228 120 236 247C700 374 768 779 768 779",
        "M-275 -309C-275 -309 -207 96 257 223C721 350 789 755 789 755",
        "M-254 -333C-254 -333 -186 72 278 199C742 326 810 731 810 731",
        "M-233 -357C-233 -357 -165 48 299 175C763 302 831 707 831 707",
        "M-212 -381C-212 -381 -144 24 320 151C784 278 852 683 852 683",
        "M-191 -405C-191 -405 -123 0 341 127C805 254 873 659 873 659",
        "M-170 -429C-170 -429 -102 -24 362 103C826 230 894 635 894 635",
        "M-149 -453C-149 -453 -81 -48 383 79C847 206 915 611 915 611",
        "M-128 -477C-128 -477 -60 -72 404 55C868 182 936 587 936 587",
        "M-107 -501C-107 -501 -39 -96 425 31C889 158 957 563 957 563",
        "M-86 -525C-86 -525 -18 -120 446 7C910 134 978 539 978 539",
        "M-65 -549C-65 -549 3 -144 467 -17C931 110 999 515 999 515",
        "M-44 -573C-44 -573 24 -168 488 -41C952 86 1020 491 1020 491",
      ];
      
      return windowSize.width < 768 ? mobilePaths : desktopPaths;
    };
    
    const optimizedPaths = createOptimizedPaths();

    // Generate additional paths for higher density
    const extraPaths = [];
    
    // Create extra paths for denser effect by interpolating between existing paths
    // Add duplicated paths with slight offset for more density
    if (!isSmallScreen) {
      // Create a duplicate set of paths offset by a small amount
      optimizedPaths.forEach(path => {
        // Simple string modification to create a slightly different path
        // This just adds a small value to the path to make it visually distinct
        const modifiedPath = path.replace(/-\d+/g, match => {
          const num = parseInt(match, 10);
          return `-${num + 5}`; // Offset by 5 units
        });
        extraPaths.push(modifiedPath);
      });
    }
    
    // Combine original and extra paths
    const allPaths = [...optimizedPaths, ...extraPaths];
    
    // Filter for different screen sizes
    if (isSmallScreen) {
      // Mobile: use 2/3 of the original path set (no extras)
      return optimizedPaths.filter((_, index) => index % 3 !== 1);
    } else if (isMediumScreen) {
      // Medium screens: use original paths + some extras 
      return allPaths.filter((_, index) => index % 2 === 0);
    } else {
      // Large screens: use all paths including extras
      return allPaths;
    }
  };

  // Select the appropriate paths based on screen size
  const [paths, setPaths] = useState(getPathsForScreenSize());

  // Calculate appropriate viewBox based on window dimensions
  const getViewBox = () => {
    const aspectRatio = windowSize.width / windowSize.height;

    // Adjust viewBox dimensions based on aspect ratio
    if (aspectRatio < 1) {
      // Portrait orientation (mobile)
      return "-350 -300 1200 1800"; // Much wider and taller viewBox to ensure paths fill the screen
    } else if (aspectRatio < 1.5) {
      // Square-ish screens (tablets)
      return "-300 -300 1200 1400"; // Wider and taller for tablets
    } else {
      // Landscape orientation (desktop)
      return "0 0 696 316"; // Original dimensions
    }
  };

  const [viewBox, setViewBox] = useState(getViewBox());

  // Update dimensions on window resize with debounce for performance
  useEffect(() => {
    // Skip in SSR context
    if (typeof window === "undefined") return;

    // Debounce function to reduce resize calculations
    const debounce = (func, wait) => {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    };

    const handleResize = debounce(() => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
      // Update paths and viewBox when window size changes
      setPaths(getPathsForScreenSize());
      setViewBox(getViewBox());
    }, 150); // 150ms debounce

    // Set initial values
    handleResize();

    // Add event listener
    window.addEventListener("resize", handleResize);

    // Clean up
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Random values for animations, but consistent across renders, with reduced complexity
  const animationParams = React.useMemo(() => {
    // Add more animation variations for greater visual diversity
    const baseAnimations = [
      { duration: 10, delay: 0, endY: 95 },
      { duration: 12, delay: 0, endY: 97 },
      { duration: 14, delay: 0, endY: 93 },
      { duration: 9, delay: 0, endY: 96 },
      { duration: 11, delay: 0, endY: 94 },
      { duration: 13, delay: 0, endY: 98 },
      { duration: 15, delay: 0, endY: 92 },
      { duration: 8, delay: 0, endY: 99 }
    ];
    
    // Use a pattern of predefined animations instead of completely random ones
    return paths.map((_, index) => baseAnimations[index % baseAnimations.length]);
  }, [paths]); // Only recreate when paths change

  return (
    <div
      className={cn(
        "absolute h-full w-full inset-0 z-0 flex items-center justify-center",
        className
      )}
    >
      <svg
        className="z-0 h-full w-full pointer-events-none absolute"
        width="100%"
        height="100%"
        viewBox={viewBox} // Dynamic viewBox based on screen size
        preserveAspectRatio="none" // Changed to none to ensure it stretches to fill container completely
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          opacity: 1,
          willChange: "transform", // Performance optimization
          transform: "translateZ(0)", // Force GPU acceleration
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        {/* Base path with brighter stroke */}
        <path
          d="M-380 -189C-380 -189 -312 216 152 343C616 470 684 875 684 875M-373 -197C-373 -197 -305 208 159 335C623 462 691 867 691 867M-366 -205C-366 -205 -298 200 166 327C630 454 698 859 698 859M-359 -213C-359 -213 -291 192 173 319C637 446 705 851 705 851M-352 -221C-352 -221 -284 184 180 311C644 438 712 843 712 843M-345 -229C-345 -229 -277 176 187 303C651 430 719 835 719 835M-338 -237C-338 -237 -270 168 194 295C658 422 726 827 726 827M-331 -245C-331 -245 -263 160 201 287C665 414 733 819 733 819M-324 -253C-324 -253 -256 152 208 279C672 406 740 811 740 811M-317 -261C-317 -261 -249 144 215 271C679 398 747 803 747 803"
          stroke="url(#paint0_radial_242_278)"
          strokeOpacity="0.4"
          strokeWidth={windowSize.width < 768 ? 2 : 2} // Original stroke width
        ></path>

        {/* Dynamic number of paths based on screen size */}
        {/* Use all paths for maximum density */}
        {paths.map((path, index) => (
          <motion.path
            key={index}
            d={path}
            initial={{
              stroke: `url(#linearGradient-${index % 20})`, // Mod to avoid too many gradients
              strokeOpacity: 0.6,
              strokeWidth: 1.5, // Slightly thinner to avoid visual crowding
            }}
            stroke={`url(#linearGradient-${index % 20})`}
            strokeOpacity="0.6"
            strokeWidth={1.5}
          ></motion.path>
        ))}
        <defs>
          {/* Create a limited set of gradients to avoid performance issues */}
          {Array.from({ length: 20 }).map((_, index) => (
            <motion.linearGradient
              id={`linearGradient-${index}`}
              x1="0%"
              x2="95%"
              y1="0%"
              y2="25%"
              key={`gradient-${index}`}
              initial={{
                x1: "0%",
                x2: "95%",
                y1: "0%",
                y2: "25%",
              }}
              animate={{
                x1: ["0%", "100%"],
                x2: ["0%", "95%"],
                y1: ["0%", "100%"],
                y2: ["25%", `${animationParams[index].endY}%`],
              }}
              transition={{
                duration: animationParams[index].duration,
                ease: "linear", // Linear is less CPU intensive than easeInOut
                repeat: Infinity,
                repeatType: "loop", 
                delay: 0,
              }}
            >
              {/* Original rainbow gradient colors */}
              <stop offset="0%" stopColor="#FF0000" stopOpacity="0"></stop>
              <stop offset="16.67%" stopColor="#FF7F00"></stop>
              <stop offset="33.33%" stopColor="#FFFF00"></stop>
              <stop offset="50%" stopColor="#00FF00"></stop>
              <stop offset="66.67%" stopColor="#0000FF"></stop>
              <stop offset="83.33%" stopColor="#4B0082"></stop>
              <stop offset="100%" stopColor="#9400D3" stopOpacity="0"></stop>
            </motion.linearGradient>
          ))}

          <radialGradient
            id="paint0_radial_242_278"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform={windowSize.width < 768 
              ? "translate(352 34) rotate(90) scale(1200 2000)" // Larger scale for mobile
              : "translate(352 34) rotate(90) scale(555 1560.62)"
            }
          >
            <stop offset="0.0666667" stopColor="#ffffff"></stop>
            <stop offset="0.243243" stopColor="#ffffff"></stop>
            <stop offset="0.43594" stopColor="white" stopOpacity="0"></stop>
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
};
