module.exports = async (request, response) => {
  const { handleOrb } = await import('../../server/orb-sms-handler.mjs');
  return handleOrb(request, response);
};
