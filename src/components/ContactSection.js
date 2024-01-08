import React from 'react';
import VideoSection from './VideoSection';
import contactVideo from '../assets/video/popcon_landingpage_vid.mp4';
import { Container, TextField, Button, Typography } from '@mui/material';

const ContactSection = () => {
    return (
        <VideoSection videoSource={contactVideo} sectionId="contact" className="contact">
            <Container sx={{
  backgroundColor: 'rgba(0, 0, 35, 0.5)',
  borderRadius: '20px',
  p: 4,
  position: 'relative',
  zIndex: 2,
  margin: 'auto',
  marginTop: '2rem',
  marginBottom: '4rem',
  width: '80%', // Sets the base width to 80% of the parent element
  maxWidth: '1200px', // Sets a maximum width to ensure it does not get too wide on very large screens
  minWidth: '500px', // Ensures that the container does not get too narrow
}}>
                <Typography variant="h2" gutterBottom color="common.white">
                    Contact Us
                </Typography>
                <form action="https://formspree.io/f/mrgvbgww" method="POST" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <TextField
                        id="name"
                        label="Name"
                        variant="filled"
                        type="text"
                        name="name"
                        required
                        fullWidth
                        sx={{ backgroundColor: 'rgba(255, 255, 255, 0.8)' }}
                    />
                    <TextField
                        id="email"
                        label="Email"
                        variant="filled"
                        type="email"
                        name="email"
                        required
                        fullWidth
                        sx={{ backgroundColor: 'rgba(255, 255, 255, 0.8)' }}
                    />
                    <TextField
                        id="message"
                        label="Message"
                        variant="filled"
                        multiline
                        rows={4}
                        name="message"
                        required
                        fullWidth
                        sx={{ backgroundColor: 'rgba(255, 255, 255, 0.8)' }}
                    />
                    <Button type="submit" variant="contained" color="secondary" size="large">
                        Submit
                    </Button>
                </form>
            </Container>
        </VideoSection>
    );
};

export default ContactSection;
