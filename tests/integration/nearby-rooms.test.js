import { beforeEach, describe, expect, it } from 'vitest';

import { GENDER } from '#src/common/constants/index.js';
import { roomService } from '#src/modules/rooms/room.service.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { createUser, resetDatabase, toRequestUser } from '../helpers/factories.js';

// Delhi, and points at increasing distance from it.
const DELHI = [77.209, 28.6139];
const NOIDA = [77.391, 28.5355]; // ~20 km
const JAIPUR = [75.7873, 26.9124]; // ~240 km

async function userAt(coordinates, city) {
  const user = await createUser({ gender: GENDER.MALE });
  await userRepository.updateById(user._id, {
    $set: { 'location.type': 'Point', 'location.coordinates': coordinates, 'location.city': city },
  });
  return user;
}

describe('nearby rooms', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('should take the location of whoever opened it', async () => {
    const host = await userAt(DELHI, 'Delhi');

    const room = await roomService.createRoom({
      user: toRequestUser(host),
      name: 'Evening chat',
    });

    expect(room.city).toBe('Delhi');
  });

  it('should find a room opened nearby', async () => {
    const host = await userAt(DELHI, 'Delhi');
    await roomService.createRoom({ user: toRequestUser(host), name: 'Delhi room' });

    const seeker = await createUser({ gender: GENDER.FEMALE });
    const { items } = await roomService.listRooms({
      userId: seeker._id,
      latitude: 28.62,
      longitude: 77.21,
      radiusKm: 50,
    });

    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Delhi room');
    expect(items[0].distanceKm).toBeLessThan(5);
  });

  it('should leave out a room beyond the radius', async () => {
    const jaipurHost = await userAt(JAIPUR, 'Jaipur');
    await roomService.createRoom({ user: toRequestUser(jaipurHost), name: 'Jaipur room' });

    const { items } = await roomService.listRooms({
      userId: jaipurHost._id,
      latitude: 28.6139,
      longitude: 77.209,
      radiusKm: 50,
    });

    expect(items).toHaveLength(0);
  });

  it('should order by distance, nearest first', async () => {
    const near = await userAt(DELHI, 'Delhi');
    const far = await userAt(NOIDA, 'Noida');

    await roomService.createRoom({ user: toRequestUser(near), name: 'Close by' });
    await roomService.createRoom({ user: toRequestUser(far), name: 'Further out' });

    const { items } = await roomService.listRooms({
      userId: near._id,
      latitude: 28.6139,
      longitude: 77.209,
      radiusKm: 100,
    });

    expect(items.map((room) => room.name)).toEqual(['Close by', 'Further out']);
    expect(items[0].distanceKm).toBeLessThan(items[1].distanceKm);
  });

  it('should still list a room whose host never shared a location', async () => {
    const host = await createUser({ gender: GENDER.MALE });
    await roomService.createRoom({ user: toRequestUser(host), name: 'No location' });

    // Absent from the nearby feed...
    const nearby = await roomService.listRooms({
      userId: host._id,
      latitude: 28.6139,
      longitude: 77.209,
      radiusKm: 500,
    });
    expect(nearby.items).toHaveLength(0);

    // ...but never hidden from the main list. A room nobody can find is worse
    // than a room without a distance label.
    const all = await roomService.listRooms({ userId: host._id });
    expect(all.items.map((room) => room.name)).toContain('No location');
  });

  it('should not follow the host if they move afterwards', async () => {
    const host = await userAt(DELHI, 'Delhi');
    await roomService.createRoom({ user: toRequestUser(host), name: 'Stays in Delhi' });

    // The host travels; the room does not.
    await userRepository.updateById(host._id, {
      $set: { 'location.coordinates': JAIPUR, 'location.city': 'Jaipur' },
    });

    const { items } = await roomService.listRooms({
      userId: host._id,
      latitude: 28.6139,
      longitude: 77.209,
      radiusKm: 50,
    });

    expect(items.map((room) => room.name)).toEqual(['Stays in Delhi']);
  });
});
