import mongoose from 'mongoose';
import { searchAvailableTruckSpace, bookTruckCapacity } from '../services/capacitySearchService.js';

/**
 * Controller to handle multi-segment capacity search requests.
 * @route GET /api/capacity/search or POST /api/capacity/search
 */
export const searchCapacity = async (req, res) => {
  try {
    const params = req.method === 'GET' ? req.query : req.body;
    const {
      pickup,
      delivery,
      date,
      volume,
      weight,
      length,
      width,
      height,
      priority,
      fragile,
      stackable
    } = params;

    const results = await searchAvailableTruckSpace({
      pickup,
      delivery,
      date,
      volume,
      weight,
      length,
      width,
      height,
      priority,
      fragile: fragile === 'true' || fragile === true,
      stackable: stackable !== 'false' && stackable !== false
    });

    res.json(results);
  } catch (error) {
    console.error('Capacity search error:', error.message);
    res.status(400).json({
      success: false,
      message: error.message || 'Capacity search failed.'
    });
  }
};

/**
 * Transactional controller to book capacity on a selected vehicle.
 * @route POST /api/capacity/book
 */
export const bookCapacity = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    try {
      session.startTransaction();
      transactionStarted = true;
    } catch (sessionErr) {
      console.warn('Mongoose standalone session mode active.');
    }

    const {
      vehicleId,
      routeId,
      pickup,
      delivery,
      date,
      volume,
      weight,
      length,
      width,
      height,
      cargoDescription,
      invoiceNumber,
      invoiceValue
    } = req.body;

    const result = await bookTruckCapacity({
      vehicleId,
      routeId,
      pickup,
      delivery,
      date,
      volume,
      weight,
      length,
      width,
      height,
      cargoDescription,
      invoiceNumber,
      invoiceValue,
      customerUser: req.user,
      session
    });

    if (transactionStarted) {
      await session.commitTransaction();
    }

    res.status(201).json({
      success: true,
      bookingId: result.booking.bookingId,
      shipmentId: result.shipment.shipmentId,
      message: `Capacity successfully reserved on truck ${result.vehicle.vehicleId}!`,
      booking: result.booking,
      shipment: result.shipment,
      payment: result.payment
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        console.error('Error aborting booking transaction:', abortErr);
      }
    }
    console.error('Capacity booking error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to complete capacity reservation.',
      details: error.details || null
    });
  } finally {
    session.endSession();
  }
};
