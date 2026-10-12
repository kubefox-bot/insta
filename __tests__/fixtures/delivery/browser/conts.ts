export const socketDeliveryPacket = /^42(\d+)(\[.*)$/s;
export const socketAcknowledgementPacket = /^43(\d+)\[/;
export const socketAcknowledgementPayload = /^43\d+(\[.*)$/s;
