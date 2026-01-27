import { z } from 'zod';
import { createTool, ToolResult } from './tool-registry';

// ============================================================================
// Schema
// ============================================================================

const GetWeatherParams = z.object({
  location: z.string().describe('City or location name'),
  startDate: z.string().describe('Start date (ISO format YYYY-MM-DD)'),
  endDate: z.string().describe('End date (ISO format YYYY-MM-DD)'),
});

type DayForecast = {
  date: string;
  condition: 'sunny' | 'partly_cloudy' | 'cloudy' | 'rainy' | 'stormy';
  tempHighC: number;
  tempLowC: number;
  precipitationPct: number;
  humidity: number;
  windSpeedKmh: number;
  uvIndex: number;
  recommendation: string;
};

type GetWeatherResult = {
  location: string;
  forecast: DayForecast[];
  summary: string;
};

// ============================================================================
// Mock Weather Data
// ============================================================================

const CITY_CLIMATE: Record<string, { baseTemp: number; variance: number; rainChance: number }> = {
  'paris': { baseTemp: 15, variance: 8, rainChance: 0.3 },
  'tokyo': { baseTemp: 18, variance: 10, rainChance: 0.35 },
  'barcelona': { baseTemp: 20, variance: 6, rainChance: 0.15 },
  'rome': { baseTemp: 19, variance: 7, rainChance: 0.2 },
  'london': { baseTemp: 12, variance: 5, rainChance: 0.5 },
  'new york': { baseTemp: 14, variance: 12, rainChance: 0.3 },
  'los angeles': { baseTemp: 22, variance: 5, rainChance: 0.1 },
  'sydney': { baseTemp: 22, variance: 6, rainChance: 0.25 },
  'default': { baseTemp: 18, variance: 8, rainChance: 0.25 },
};

const CONDITIONS: DayForecast['condition'][] = ['sunny', 'partly_cloudy', 'cloudy', 'rainy', 'stormy'];

function getRecommendation(condition: DayForecast['condition'], tempHigh: number): string {
  if (condition === 'rainy' || condition === 'stormy') {
    return 'Bring an umbrella! Good day for indoor activities.';
  }
  if (tempHigh > 30) {
    return 'Stay hydrated and seek shade during peak hours.';
  }
  if (tempHigh < 10) {
    return 'Dress warmly in layers.';
  }
  if (condition === 'sunny') {
    return 'Perfect weather for outdoor exploration!';
  }
  return 'Good conditions for sightseeing.';
}

// ============================================================================
// Tool Implementation
// ============================================================================

export const getWeatherTool = createTool({
  name: 'get_weather',
  description: 'Get weather forecast for a location and date range. Useful for planning outdoor activities.',
  parameters: GetWeatherParams,

  async handler(params): Promise<ToolResult<GetWeatherResult>> {
    try {
      const startDate = new Date(params.startDate);
      const endDate = new Date(params.endDate);
      
      if (endDate < startDate) {
        return {
          success: false,
          error: 'End date must be after start date',
          code: 'INVALID_DATE_RANGE',
        };
      }

      // Limit forecast to 14 days
      const maxDays = 14;
      const dayCount = Math.min(
        Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        maxDays
      );

      const locationKey = params.location.toLowerCase();
      const climate = CITY_CLIMATE[locationKey] || CITY_CLIMATE['default'];
      
      const forecast: DayForecast[] = [];
      let rainDays = 0;
      let sunnyDays = 0;

      for (let i = 0; i < dayCount; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        // Generate deterministic but varied weather
        const hash = (params.location + dateStr).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const random = (hash % 100) / 100;
        
        // Determine condition
        let condition: DayForecast['condition'];
        if (random < climate.rainChance * 0.3) {
          condition = 'stormy';
          rainDays++;
        } else if (random < climate.rainChance) {
          condition = 'rainy';
          rainDays++;
        } else if (random < climate.rainChance + 0.2) {
          condition = 'cloudy';
        } else if (random < climate.rainChance + 0.5) {
          condition = 'partly_cloudy';
          sunnyDays++;
        } else {
          condition = 'sunny';
          sunnyDays++;
        }

        // Temperature with seasonal variance
        const month = date.getMonth();
        const seasonalMod = Math.cos((month - 6) * Math.PI / 6) * climate.variance;
        const dailyVariance = ((hash % 50) - 25) / 10;
        
        const tempHigh = Math.round(climate.baseTemp + seasonalMod + dailyVariance);
        const tempLow = Math.round(tempHigh - 5 - (hash % 5));

        forecast.push({
          date: dateStr,
          condition,
          tempHighC: tempHigh,
          tempLowC: tempLow,
          precipitationPct: condition === 'rainy' ? 60 + (hash % 30) : condition === 'stormy' ? 80 + (hash % 20) : hash % 20,
          humidity: 40 + (hash % 40),
          windSpeedKmh: 5 + (hash % 25),
          uvIndex: condition === 'sunny' ? 6 + (hash % 4) : condition === 'partly_cloudy' ? 4 + (hash % 3) : 2,
          recommendation: getRecommendation(condition, tempHigh),
        });
      }

      // Generate summary
      const avgTemp = Math.round(forecast.reduce((a, f) => a + f.tempHighC, 0) / forecast.length);
      let summary: string;
      
      if (rainDays === 0) {
        summary = `Excellent weather expected in ${params.location}! ${sunnyDays} sunny days with average highs of ${avgTemp}°C.`;
      } else if (rainDays > dayCount / 2) {
        summary = `Mixed weather in ${params.location} with ${rainDays} rainy days. Pack accordingly! Average temperature ${avgTemp}°C.`;
      } else {
        summary = `Mostly pleasant in ${params.location} with ${sunnyDays} nice days and ${rainDays} rainy day(s). Highs around ${avgTemp}°C.`;
      }

      return {
        success: true,
        data: {
          location: params.location,
          forecast,
          summary,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Weather fetch failed',
        code: 'WEATHER_ERROR',
      };
    }
  },
});
