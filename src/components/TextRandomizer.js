import React, { useState, useEffect, useRef } from "react";

export const TextRandomizer = ({ 
  text, 
  className = "", 
  style = {}, 
  duration = 2000,
  randomChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,./<>?",
  rainbow = true,
  delay = 0
}) => {
  const [displayText, setDisplayText] = useState("");
  const [animationComplete, setAnimationComplete] = useState(false);
  const intervalRef = useRef(null);
  const frameRef = useRef(0);
  const startTimeRef = useRef(0);
  const targetTextRef = useRef(text);
  const charsRef = useRef(randomChars.split(""));
  const gradientOffsetRef = useRef(0);

  // Generate random gradient colors
  const generateRainbowGradient = (offset = 0) => {
    const colors = [];
    const count = 6; // Number of colors in the gradient
    
    for (let i = 0; i < count; i++) {
      const hue = ((i * 60) + offset) % 360; // 60 degrees apart, full spectrum
      colors.push(`hsl(${hue}, 80%, 60%)`);
    }
    
    return `linear-gradient(
      to right,
      ${colors.join(', ')}
    )`;
  };

  // Function to get random character
  const getRandomChar = () => {
    return charsRef.current[Math.floor(Math.random() * charsRef.current.length)];
  };

  // Start the animation after the specified delay
  useEffect(() => {
    const delayTimer = setTimeout(() => {
      startAnimation();
    }, delay);

    return () => clearTimeout(delayTimer);
  }, [delay]);

  // Handle text changes from parent
  useEffect(() => {
    targetTextRef.current = text;
    if (animationComplete) {
      setDisplayText(text);
    } else {
      // Restart animation if text changes during animation
      startAnimation();
    }
  }, [text]);

  // Start or restart the animation
  const startAnimation = () => {
    // Reset state
    setAnimationComplete(false);
    frameRef.current = 0;
    startTimeRef.current = performance.now();
    
    // Clear any existing animation
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    // Initialize with random characters
    const initialRandomText = Array(targetTextRef.current.length)
      .fill(0)
      .map(() => getRandomChar())
      .join("");
    
    setDisplayText(initialRandomText);
    
    // Set up the animation interval
    intervalRef.current = setInterval(() => {
      const elapsed = performance.now() - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      
      // Update the gradient animation
      gradientOffsetRef.current = (gradientOffsetRef.current + 2) % 360;
      
      // Determine how many characters should be revealed
      const revealedCount = Math.floor(progress * targetTextRef.current.length);
      
      // Build the new text
      let newText = "";
      for (let i = 0; i < targetTextRef.current.length; i++) {
        if (i < revealedCount) {
          // This character is revealed
          newText += targetTextRef.current[i];
        } else {
          // This character is still randomizing
          newText += getRandomChar();
        }
      }
      
      setDisplayText(newText);
      
      // Check if animation is complete
      if (progress >= 1) {
        clearInterval(intervalRef.current);
        setAnimationComplete(true);
      }
      
      frameRef.current++;
    }, 50); // Update every 50ms for smooth animation
    
    // Cleanup function
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <span 
      className={`text-randomizer ${className}`}
      style={{
        ...style,
        ...(rainbow && !animationComplete ? {
          background: generateRainbowGradient(gradientOffsetRef.current),
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          WebkitTextFillColor: "transparent",
          fontWeight: "bold",
          display: "inline-block",
          transition: "background 0.5s ease"
        } : {})
      }}
    >
      {displayText}
    </span>
  );
};

export const TextRandomizerSection = ({ 
  children, 
  staggerDelay = 150,
  duration = 2000,
  rainbow = true,
  className = "",
  style = {}
}) => {
  // This component takes text content and wraps each paragraph or element
  // in TextRandomizer components with staggered start times
  
  const childrenArray = React.Children.toArray(children);
  
  return (
    <div className={`text-randomizer-section ${className}`} style={style}>
      {childrenArray.map((child, index) => {
        if (typeof child === 'string') {
          // Split text by newlines and wrap each paragraph
          return child.split('\n').map((paragraph, pIndex) => (
            <React.Fragment key={`p-${index}-${pIndex}`}>
              <TextRandomizer
                text={paragraph}
                delay={index * staggerDelay + pIndex * staggerDelay}
                duration={duration}
                rainbow={rainbow}
              />
              {pIndex < child.split('\n').length - 1 && <br />}
            </React.Fragment>
          ));
        } else if (React.isValidElement(child)) {
          // Handle React elements by cloning and wrapping their children
          return React.cloneElement(
            child,
            {
              key: `elem-${index}`,
              style: { ...child.props.style }
            },
            <TextRandomizer
              text={child.props.children}
              delay={index * staggerDelay}
              duration={duration}
              rainbow={rainbow}
            />
          );
        } else {
          return child;
        }
      })}
    </div>
  );
};