const router = require('express').Router();
const { createTicket, getMyTickets, getTicket, replyTicket, closeTicket, getAllTickets } = require('../controllers/supportController');
const { protect, adminOnly } = require('../middleware/auth');

router.post('/', protect, createTicket);
router.get('/my', protect, getMyTickets);
router.get('/all', protect, adminOnly, getAllTickets);
router.get('/:id', protect, getTicket);
router.post('/:id/reply', protect, replyTicket);
router.put('/:id/close', protect, closeTicket);

module.exports = router;