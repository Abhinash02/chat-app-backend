import { beforeEach, describe, expect, it } from 'vitest';

import { GENDER } from '#src/common/constants/index.js';
import { roomService } from '#src/modules/rooms/room.service.js';
import { roomRepository } from '#src/modules/rooms/room.repository.js';
import { createUser, resetDatabase, toRequestUser } from '../helpers/factories.js';

describe('room lifecycle', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('should keep a room alive when the host socket drops', async () => {
    const host = await createUser({ gender: GENDER.MALE });
    const room = await roomService.createRoom({ user: toRequestUser(host), name: 'My room' });

    // Backgrounding the app, a tunnel, a screen change — all look like this.
    await roomService.handleUserDisconnected(host._id);

    const after = await roomRepository.findById(room.id);
    expect(after.status).toBe('live');

    const { items } = await roomService.listRooms({ userId: host._id });
    expect(items.map((item) => item.name)).toContain('My room');
  });

  it('should let the host come back to their room', async () => {
    const host = await createUser({ gender: GENDER.MALE });
    const room = await roomService.createRoom({ user: toRequestUser(host), name: 'Back soon' });

    await roomService.handleUserDisconnected(host._id);
    const rejoined = await roomService.joinRoom({ user: toRequestUser(host), roomId: room.id });

    expect(rejoined.room.status).toBe('live');
    expect(rejoined.room.participantCount).toBe(1);
  });

  it('should still close the room when the host deliberately leaves', async () => {
    const host = await createUser({ gender: GENDER.MALE });
    const room = await roomService.createRoom({ user: toRequestUser(host), name: 'Done here' });

    // Choosing to leave is different from being disconnected.
    const result = await roomService.leaveRoom({ user: toRequestUser(host), roomId: room.id });

    expect(result.roomClosed).toBe(true);
    expect((await roomRepository.findById(room.id)).status).toBe('closed');
  });

  it('should drop a guest from the list when their socket goes', async () => {
    const host = await createUser({ gender: GENDER.MALE });
    const guest = await createUser({ gender: GENDER.FEMALE });

    const room = await roomService.createRoom({ user: toRequestUser(host), name: 'Two of us' });
    await roomService.joinRoom({ user: toRequestUser(guest), roomId: room.id });

    expect((await roomRepository.findById(room.id)).participantCount).toBe(2);

    await roomService.handleUserDisconnected(guest._id);

    const after = await roomRepository.findById(room.id);
    expect(after.participantCount).toBe(1);
    expect(after.status).toBe('live');
  });

  it('should collect a room that has sat empty', async () => {
    const host = await createUser({ gender: GENDER.MALE });
    const room = await roomService.createRoom({ user: toRequestUser(host), name: 'Abandoned' });

    await roomService.handleUserDisconnected(host._id);

    // Nobody came back within the grace period.
    await roomRepository.closeStaleRooms(new Date(Date.now() + 60_000));

    expect((await roomRepository.findById(room.id)).status).toBe('closed');
  });

  it('should not collect a room that still has someone in it', async () => {
    const host = await createUser({ gender: GENDER.MALE });
    const room = await roomService.createRoom({ user: toRequestUser(host), name: 'Occupied' });

    await roomRepository.closeStaleRooms(new Date(Date.now() + 60_000));

    expect((await roomRepository.findById(room.id)).status).toBe('live');
  });
});
