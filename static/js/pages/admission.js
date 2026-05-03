function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setImageValue(imgId, hiddenId, value) {
  const img = document.getElementById(imgId);
  const hidden = document.getElementById(hiddenId);
  const fallback = 'https://via.placeholder.com/300x200?text=No+Photo';
  if (hidden) hidden.value = value || '';
  if (img) {
    img.src = value || fallback;
    img.classList.toggle('opacity-40', !value);
  }
}

function setupPhotoInput(fileId, hiddenId, imgId) {
  const fileInput = document.getElementById(fileId);
  if (!fileInput) return;
  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataURL(file);
      setImageValue(imgId, hiddenId, dataUrl);
    } catch (error) {
      window.showToast('Unable to read selected image.', true);
    }
  });
}

function resetAdmissionVisuals() {
  setImageValue('new-patient-photo1-preview', 'new-patient-photo1-hidden', '');
  setImageValue('new-patient-photo2-preview', 'new-patient-photo2-hidden', '');
  setImageValue('new-patient-photo3-preview', 'new-patient-photo3-hidden', '');
  const laundryContainer = document.getElementById('laundry-amount-container');
  if (laundryContainer) laundryContainer.classList.add('hidden');
}

function bindLaundryToggle() {
  const laundryCheckbox = document.getElementById('new-patient-laundry-status');
  if (!laundryCheckbox) return;
  laundryCheckbox.addEventListener('change', function onChange() {
    const container = document.getElementById('laundry-amount-container');
    if (!container) return;
    if (this.checked) container.classList.remove('hidden');
    else container.classList.add('hidden');
  });
}

async function addNewPatient(e) {
  e.preventDefault();
  const formData = {
    name: document.getElementById('new-patient-name').value,
    fatherName: document.getElementById('new-patient-father').value,
    admissionDate: document.getElementById('new-patient-admission').value,
    age: document.getElementById('new-patient-age').value,
    cnic: document.getElementById('new-patient-cnic').value,
    contactNo: document.getElementById('new-patient-contact').value,
    guardianName: document.getElementById('new-patient-guardian').value,
    address: document.getElementById('new-patient-address').value,
    area: document.getElementById('new-patient-area').value || '',
    monthlyFee: document.getElementById('new-patient-fee').value || '0',
    monthlyAllowance: document.getElementById('new-patient-allowance').value || '3000',
    receivedAmount: document.getElementById('new-patient-received').value || '0',
    photo1: document.getElementById('new-patient-photo1-hidden').value || '',
    photo2: document.getElementById('new-patient-photo2-hidden').value || '',
    photo3: document.getElementById('new-patient-photo3-hidden').value || '',
    laundryStatus: document.getElementById('new-patient-laundry-status').checked,
    laundryAmount: document.getElementById('new-patient-laundry-amount').value || '3500',
  };

  const res = await fetch('/api/patients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });

  if (res.ok) {
    document.getElementById('new-admission-form').reset();
    resetAdmissionVisuals();
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('new-patient-admission').value = today;
    window.showToast('Patient admitted successfully!');
  } else {
    window.showToast('Error adding patient. Please try again.', true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('new-patient-admission').value = today;
  setupPhotoInput('new-patient-photo1-file', 'new-patient-photo1-hidden', 'new-patient-photo1-preview');
  setupPhotoInput('new-patient-photo2-file', 'new-patient-photo2-hidden', 'new-patient-photo2-preview');
  setupPhotoInput('new-patient-photo3-file', 'new-patient-photo3-hidden', 'new-patient-photo3-preview');
  bindLaundryToggle();
});
