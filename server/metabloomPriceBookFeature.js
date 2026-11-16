// The server is the authority. Client capability negotiation cannot enable this.
function isMetabloomPriceBookEnabled(env = process.env) {
  return env.METABLOOM_PRICEBOOK_ENABLED === '1';
}

module.exports = { isMetabloomPriceBookEnabled };
