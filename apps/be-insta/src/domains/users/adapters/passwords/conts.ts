export const passwordWork = { memoryCostKiB: 65536, timeCost: 3 } as const;

// Заранее подготовленный Argon2id с теми же затратами, что у реального пароля.
export const dummyPasswordHash =
  "$argon2id$v=19$m=65536,t=3,p=1$6p10MPAx5wvV2VRlM/SRCTx2DsTQqdSUJZXJnw8T2as$QRwW6HeR6HsFRKpSnvOR3EAJaOQvBt8YlrNV7TbivVo";
