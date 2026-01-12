/**
 * Money Utilities
 * 
 * All monetary values are stored and processed as INTEGER CENTS
 * to ensure deterministic calculations without floating-point errors.
 */

/**
 * Convert cents to a formatted dollar string for display
 * @param cents - Amount in cents (integer)
 * @returns Formatted string like "$1,234.56"
 */
export function centsToDollars(cents: number): string {
    const dollars = cents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(dollars);
  }
  
  /**
   * Convert a dollar amount to cents
   * @param dollars - Amount in dollars (can have decimals)
   * @returns Integer cents
   */
  export function dollarsToCents(dollars: number): number {
    return Math.round(dollars * 100);
  }
  
  /**
   * Sum an array of cent values safely
   * @param values - Array of cent amounts
   * @returns Total in cents
   */
  export function sumCents(values: number[]): number {
    return values.reduce((acc, val) => acc + val, 0);
  }
  
  /**
   * Calculate average of cent values
   * @param values - Array of cent amounts
   * @returns Average in cents (rounded to integer)
   */
  export function averageCents(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(sumCents(values) / values.length);
  }