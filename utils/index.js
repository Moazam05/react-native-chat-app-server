const formatTimestamp = (date) => {
  const d = new Date(date);

  // Get date components
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();

  // Get time components
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";

  // Convert hours to 12-hour format
  hours = hours % 12;
  hours = hours ? hours : 12; // Convert 0 to 12
  hours = hours.toString().padStart(2, "0");

  return `${day}-${month}-${year} ${hours}:${minutes} ${ampm}`;
};

module.exports = {
  formatTimestamp,
};
