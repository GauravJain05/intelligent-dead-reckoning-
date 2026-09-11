/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:            '#EEF0F5', 
        screenCream:   '#F3EEDC', 
        bezel:         '#1B1E29', 
        navy:          '#1F2A44', 
        navyPrimary:   '#2B3A55', 
        navyLine:      '#2B3A55', 
        green:         '#3F7D4C', 
        red:           '#8B2E2E', 
        arrowBlue:     '#5B8DBF', 
        mapBlue:       '#BFD9E8', 
        tunnelGray:    '#8B8F99', 
        trackGray:     '#D9D9DE', 
        cardGray:      '#E8E8EC', 
        captionNavy:   '#1F2A44', 
      }
    },
  },
  plugins: [],
}
