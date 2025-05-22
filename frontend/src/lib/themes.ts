export type Theme = {
  name: string;
  label: string;
  colors: {
    light: {
      background: string;
      foreground: string;
      primary: string;
      "primary-foreground": string;
      secondary: string;
      "secondary-foreground": string;
      muted: string;
      "muted-foreground": string;
      accent: string;
      "accent-foreground": string;
    };
    dark: {
      background: string;
      foreground: string;
      primary: string;
      "primary-foreground": string;
      secondary: string;
      "secondary-foreground": string;
      muted: string;
      "muted-foreground": string;
      accent: string;
      "accent-foreground": string;
    };
  };
};

export const themes: Theme[] = [
  {
    name: "zinc",
    label: "Zinc",
    colors: {
      light: {
        background: "240 5% 98%",
        foreground: "240 10% 3.9%",
        primary: "240 5.9% 10%",
        "primary-foreground": "0 0% 98%",
        secondary: "240 4.8% 95.9%",
        "secondary-foreground": "240 5.9% 10%",
        muted: "240 4.8% 95.9%",
        "muted-foreground": "240 3.8% 46.1%",
        accent: "240 4.8% 95.9%",
        "accent-foreground": "240 5.9% 10%"
      },
      dark: {
        background: "240 10% 4%",
        foreground: "0 0% 98%",
        primary: "240 5.2% 33.9%",
        "primary-foreground": "0 0% 98%",
        secondary: "240 3.7% 15.9%",
        "secondary-foreground": "0 0% 98%",
        muted: "240 3.7% 15.9%",
        "muted-foreground": "240 5% 64.9%",
        accent: "240 3.7% 15.9%",
        "accent-foreground": "0 0% 98%"
      }
    }
  },
  {
    name: "blue",
    label: "Blue",
    colors: {
      light: {
        background: "210 40% 98%",
        foreground: "222.2 84% 4.9%",
        primary: "221.2 83.2% 53.3%",
        "primary-foreground": "210 40% 98%",
        secondary: "210 40% 96.1%",
        "secondary-foreground": "222.2 47.4% 11.2%",
        muted: "210 40% 96.1%",
        "muted-foreground": "215.4 16.3% 46.9%",
        accent: "210 40% 96.1%",
        "accent-foreground": "222.2 47.4% 11.2%"
      },
      dark: {
        background: "222.2 47.4% 4.9%",
        foreground: "210 40% 98%",
        primary: "217.2 91.2% 59.8%",
        "primary-foreground": "222.2 47.4% 11.2%",
        secondary: "217.2 32.6% 17.5%",
        "secondary-foreground": "210 40% 98%",
        muted: "217.2 32.6% 17.5%",
        "muted-foreground": "215 20.2% 65.1%",
        accent: "217.2 32.6% 17.5%",
        "accent-foreground": "210 40% 98%"
      }
    }
  },
  {
    name: "violet",
    label: "Violet",
    colors: {
      light: {
        background: "250 40% 98%",
        foreground: "224 71.4% 4.1%",
        primary: "262.1 83.3% 57.8%",
        "primary-foreground": "210 20% 98%",
        secondary: "220 14.3% 95.9%",
        "secondary-foreground": "220.9 39.3% 11%",
        muted: "220 14.3% 95.9%",
        "muted-foreground": "220 8.9% 46.1%",
        accent: "220 14.3% 95.9%",
        "accent-foreground": "220.9 39.3% 11%"
      },
      dark: {
        background: "224 40% 4.1%",
        foreground: "210 20% 98%",
        primary: "263.4 70% 50.4%",
        "primary-foreground": "210 20% 98%",
        secondary: "215 27.9% 16.9%",
        "secondary-foreground": "210 20% 98%",
        muted: "215 27.9% 16.9%",
        "muted-foreground": "217.9 10.6% 64.9%",
        accent: "215 27.9% 16.9%",
        "accent-foreground": "210 20% 98%"
      }
    }
  },
  {
    name: "green",
    label: "Green",
    colors: {
      light: {
        background: "150 40% 98%",
        foreground: "240 10% 3.9%",
        primary: "142.1 76.2% 36.3%",
        "primary-foreground": "355.7 100% 97.3%",
        secondary: "142.1 76.2% 46.3%",
        "secondary-foreground": "240 5.9% 10%",
        muted: "240 4.8% 95.9%",
        "muted-foreground": "240 3.8% 46.1%",
        accent: "240 4.8% 95.9%",
        "accent-foreground": "240 5.9% 10%"
      },
      dark: {
        background: "150 40% 4.1%",
        foreground: "0 0% 95%",
        primary: "142.1 70.6% 45.3%",
        "primary-foreground": "144.9 80.4% 10%",
        secondary: "142.1 70.6% 55.3%",
        "secondary-foreground": "0 0% 98%",
        muted: "240 3.7% 15.9%",
        "muted-foreground": "240 5% 64.9%",
        accent: "240 3.7% 15.9%",
        "accent-foreground": "0 0% 98%"
      }
    }
  },
  {
    name: "orange",
    label: "Orange",
    colors: {
      light: {
        background: "30 40% 98%",
        foreground: "20 14.3% 4.1%",
        primary: "24.6 95% 53.1%",
        "primary-foreground": "60 9.1% 97.8%",
        secondary: "60 4.8% 95.9%",
        "secondary-foreground": "24 9.8% 10%",
        muted: "60 4.8% 95.9%",
        "muted-foreground": "25 5.3% 44.7%",
        accent: "60 4.8% 95.9%",
        "accent-foreground": "24 9.8% 10%"
      },
      dark: {
        background: "20 40% 4.1%",
        foreground: "60 9.1% 97.8%",
        primary: "20.5 90.2% 48.2%",
        "primary-foreground": "60 9.1% 97.8%",
        secondary: "12 6.5% 15.1%",
        "secondary-foreground": "60 9.1% 97.8%",
        muted: "12 6.5% 15.1%",
        "muted-foreground": "24 5.4% 63.9%",
        accent: "12 6.5% 15.1%",
        "accent-foreground": "60 9.1% 97.8%"
      }
    }
  }
];