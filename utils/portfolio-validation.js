export function validateAddHolding(ticker, shares , buyPrice) {
    const errors = [];

     if (!ticker || !shares || !buyPrice) {
        errors.push('ticker, shares, and buyPrice are required');
    }

    if (isNaN(shares) || Number(shares) <= 0) {
        errors.push('shares must be a positive number');
    }

    if (isNaN(buyPrice) || Number(buyPrice) <= 0) {
        errors.push('buyPrice must be a positive number');
    }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateUpdateHolding(ticker, shares, buyPrice) {
  const errors = [];

  if (shares !== undefined && (isNaN(shares) || Number(shares) <= 0)) {
    errors.push('shares must be a positive number');
  }

  if (buyPrice !== undefined && (isNaN(buyPrice) || Number(buyPrice) <= 0)) {
    errors.push('buyPrice must be a positive number');
  }

  if (ticker === undefined && shares === undefined && buyPrice === undefined) {
    errors.push('At least one field (ticker, shares, buyPrice) must be provided');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateHoldingId(holdingId) {
  if (isNaN(holdingId)) {
    return {
      isValid: false,
      errors: ['Holding ID must be a number'],
    };
  }

  return {
    isValid: true,
    errors: [],
  };
}