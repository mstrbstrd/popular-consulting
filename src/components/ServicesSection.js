import React from 'react';
import { Box, Card, CardContent, Typography, Grid, CardMedia } from '@mui/material';

// Replace these with the correct paths to your images and icons
import webdevBackground from '../assets/img/popcon_cardicon1.png'; // Background image for Web Development card
import seoBackground from '../assets/img/popcon_cardicon2.png'; // Background image for SEO & Copywriting card
import trainingBackground from '../assets/img/popcon_cardicon3.png'; // Background image for Workforce Training card
import webdevIcon from '../assets/icons/webdev.svg';
import seoIcon from '../assets/icons/seo.svg';
import trainingIcon from '../assets/icons/copywrite.svg';

const ServiceCard = ({ title, description, icon, background }) => {
    return (
      <Card sx={{
        minWidth: '345px',
        maxWidth: '345px',
        m: 2,
        boxShadow: 3,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative', // Ensure that this card is positioned relatively
        transition: 'box-shadow 0.3s ease-in-out, transform 0.3s ease-in-out', // Smooth transition for box-shadow and transform
        ':hover': {
        boxShadow: '0px 15px 30px rgba(0, 0, 0, 0.2)', // More pronounced shadow on hover
        transform: 'translateY(-5px)' // Slight vertical lift
  }
      }}>
        <Box sx={{ position: 'relative', height: '140px', width: '100%' }}> {/* Encapsulate the image and icon in a Box */}
          <CardMedia
            component="img"
            image={background}
            alt={title}
            sx={{ width: '100%', height: '100%' }} // Removed absolute positioning
          />
          <Box
            component="img"
            src={icon}
            alt={`${title} icon`}
            sx={{
              width: '64px',
              position: 'absolute',
              top: '50%', // Position it to the middle of the CardMedia
              left: '50%',
              transform: 'translate(-50%, -50%)', // Center the icon
            }}
          />
        </Box>
        <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
        <Typography gutterBottom variant="h4" component="div" sx={{ 
                    fontSize: '3rem', // Adjust the font size for h2 equivalent
                    padding: '1rem', // Add padding as per your CSS
                    textDecoration: 'underline'
                    }}>
                        {title}
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ 
                    padding: '1rem', // Add padding as per your CSS
                    fontSize: '2rem',
                    }}>
                        {description}
        </Typography>
        </CardContent>
      </Card>
    );
  };
  

const ServicesSection = () => {
  return (
    <section id="services">
    <Box
  sx={{
    padding: '3rem', // translates to 3rem of padding on all sides
    minHeight: '80vh', // sets a minimum height of 30% of the viewport height
    display: 'flex', // uses flexbox for layout
    flexDirection: 'column', // stacks children vertically
    justifyContent: 'center', // centers children along the vertical axis
    alignItems: 'center', // centers children along the horizontal axis
    color: 'white', // sets the text color to white
    textAlign: 'center', // centers the text alignment
    background: 'linear-gradient(#c8c9d9, #5d4257)' // sets the background gradient
  }}
>
      <Typography variant="h2" component="h2" gutterBottom textAlign="center" sx={{ fontWeight: 'bold', paddingTop: "3rem", textDecoration: 'underline' }}>
        We Cover Everything.
      </Typography>
      <Typography variant="h3" component="h3" sx={{ textAlign: 'center', mb: 4 }}>
        From strategy and planning to implementation and optimization.
      </Typography>
      <Grid container spacing={2} justifyContent="center">
        <ServiceCard
          title="Web Development"
          description="Creation and integration of industry leading technology in your business's website. Whether it be E-Commerce, Web-3 or a basic landing page. We've got your back."
          icon={webdevIcon}
          background={webdevBackground}
        />
        <ServiceCard
          title="SEO & Copywriting"
          description="The art of copywriting with the science of SEO. We specialize in identifying search patterns, optimizing website content, and conducting keyword research."
          icon={seoIcon}
          background={seoBackground}
        />
        <ServiceCard
          title="Workforce Training"
          description="We offer comprehensive workforce training programs. These are designed to upskill your team in the latest technologies, ensuring your business stays ahead."
          icon={trainingIcon}
          background={trainingBackground}
        />
      </Grid>
    </Box>
    </section>
  );
};

export default ServicesSection;