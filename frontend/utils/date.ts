export const formatLocalDate = (dateString: string): string => {
  if (!dateString) return "";
  const isUtc = dateString.endsWith("Z") || dateString.includes("+");
  const utcString = isUtc ? dateString : `${dateString}Z`;
  return new Date(utcString).toLocaleString();
};

export const formatLocalDateOnly = (dateString: string): string => {
  if (!dateString) return "";
  const isUtc = dateString.endsWith("Z") || dateString.includes("+");
  const utcString = isUtc ? dateString : `${dateString}Z`;
  return new Date(utcString).toLocaleDateString();
};
