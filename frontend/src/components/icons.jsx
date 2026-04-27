import React from 'react';

const Icon = ({ size = 18, className = '', children }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

export const IconTrendUp = (props) => (
  <Icon {...props}>
    <polyline points="3 17 9 11 13 15 21 7" />
    <polyline points="14 7 21 7 21 14" />
  </Icon>
);

export const IconTrendDown = (props) => (
  <Icon {...props}>
    <polyline points="3 7 9 13 13 9 21 17" />
    <polyline points="14 17 21 17 21 10" />
  </Icon>
);

export const IconScale = (props) => (
  <Icon {...props}>
    <line x1="12" y1="3" x2="12" y2="21" />
    <line x1="6" y1="6" x2="18" y2="6" />
    <path d="M6 6l-3 7a3 3 0 0 0 6 0z" />
    <path d="M18 6l-3 7a3 3 0 0 0 6 0z" />
    <line x1="8" y1="21" x2="16" y2="21" />
  </Icon>
);

export const IconPieChart = (props) => (
  <Icon {...props}>
    <path d="M21 12A9 9 0 1 1 12 3v9z" />
    <path d="M21 12a9 9 0 0 0-9-9v9z" />
  </Icon>
);

export const IconWallet = (props) => (
  <Icon {...props}>
    <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v0H3z" />
    <path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H3z" />
    <circle cx="17" cy="14" r="1.2" />
  </Icon>
);

export const IconUser = (props) => (
  <Icon {...props}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
);

export const IconBank = (props) => (
  <Icon {...props}>
    <polyline points="3 10 12 4 21 10" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="5" y1="10" x2="5" y2="18" />
    <line x1="10" y1="10" x2="10" y2="18" />
    <line x1="14" y1="10" x2="14" y2="18" />
    <line x1="19" y1="10" x2="19" y2="18" />
    <line x1="3" y1="20" x2="21" y2="20" />
  </Icon>
);

export const IconCard = (props) => (
  <Icon {...props}>
    <rect x="2" y="6" width="20" height="14" rx="2" />
    <line x1="2" y1="11" x2="22" y2="11" />
    <line x1="6" y1="16" x2="10" y2="16" />
  </Icon>
);

export const IconClose = (props) => (
  <Icon {...props}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </Icon>
);

export const IconPlus = (props) => (
  <Icon {...props}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Icon>
);

export const IconArrowRight = (props) => (
  <Icon {...props}>
    <line x1="4" y1="12" x2="20" y2="12" />
    <polyline points="13 5 20 12 13 19" />
  </Icon>
);

export const IconArrowLeft = (props) => (
  <Icon {...props}>
    <line x1="20" y1="12" x2="4" y2="12" />
    <polyline points="11 5 4 12 11 19" />
  </Icon>
);

export const IconArrowLeftRight = (props) => (
  <Icon {...props}>
    <polyline points="17 4 21 8 17 12" />
    <line x1="3" y1="8" x2="21" y2="8" />
    <polyline points="7 12 3 16 7 20" />
    <line x1="3" y1="16" x2="21" y2="16" />
  </Icon>
);

export const IconCheck = (props) => (
  <Icon {...props}>
    <polyline points="4 12 10 18 20 6" />
  </Icon>
);

export const IconX = (props) => (
  <Icon {...props}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </Icon>
);

export const IconAlert = (props) => (
  <Icon {...props}>
    <path d="M12 3l10 17H2z" />
    <line x1="12" y1="10" x2="12" y2="14" />
    <line x1="12" y1="17" x2="12" y2="17.01" />
  </Icon>
);

export const IconPencil = (props) => (
  <Icon {...props}>
    <path d="M14 4l6 6-11 11H3v-6z" />
    <line x1="13" y1="5" x2="19" y2="11" />
  </Icon>
);

export const IconTrash = (props) => (
  <Icon {...props}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </Icon>
);

export const ACCOUNT_ICONS = {
  user: IconUser,
  bank: IconBank,
  card: IconCard,
};

export const AccountIcon = ({ name, size = 18, className = '' }) => {
  const Cmp = ACCOUNT_ICONS[name] ?? IconCard;
  return <Cmp size={size} className={className} />;
};
