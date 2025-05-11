// Form validation and submission
document.addEventListener('DOMContentLoaded', () => {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch('/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });

                if (response.ok) {
                    window.location.href = '/voting';
                } else {
                    const data = await response.json();
                    alert(data.message || 'Login failed');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('An error occurred during login');
            }
        });
    }

    // Registration form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (password !== confirmPassword) {
                alert('Passwords do not match');
                return;
            }

            try {
                const response = await fetch('/auth/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, email, password })
                });

                if (response.ok) {
                    window.location.href = '/voting';
                } else {
                    const data = await response.json();
                    alert(data.message || 'Registration failed');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('An error occurred during registration');
            }
        });
    }

    // Create election form
    const createElectionForm = document.getElementById('createElectionForm');
    if (createElectionForm) {
        createElectionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('title').value;
            const description = document.getElementById('description').value;
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            const candidates = Array.from(document.querySelectorAll('.candidate-input'))
                .map(input => input.value)
                .filter(name => name.trim() !== '');

            if (candidates.length < 2) {
                alert('Please add at least 2 candidates');
                return;
            }

            try {
                const response = await fetch('/admin/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        title,
                        description,
                        startDate,
                        endDate,
                        candidates
                    })
                });

                if (response.ok) {
                    window.location.href = '/admin';
                } else {
                    const data = await response.json();
                    alert(data.message || 'Failed to create election');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('An error occurred while creating the election');
            }
        });

        // Add candidate input field
        const addCandidateBtn = document.getElementById('addCandidate');
        if (addCandidateBtn) {
            addCandidateBtn.addEventListener('click', () => {
                const candidatesContainer = document.getElementById('candidatesContainer');
                const newInput = document.createElement('div');
                newInput.className = 'candidate-input-container';
                newInput.innerHTML = `
                    <input type="text" class="candidate-input" placeholder="Candidate name" required>
                    <button type="button" class="remove-candidate">Remove</button>
                `;
                candidatesContainer.appendChild(newInput);

                // Add remove functionality
                newInput.querySelector('.remove-candidate').addEventListener('click', () => {
                    newInput.remove();
                });
            });
        }
    }

    // Vote buttons
    const voteButtons = document.querySelectorAll('.vote-btn');
    voteButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            const electionId = e.target.dataset.electionId;
            const candidateId = e.target.dataset.candidateId;

            try {
                const response = await fetch('/voting/vote', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ electionId, candidateId })
                });

                if (response.ok) {
                    window.location.reload();
                } else {
                    const data = await response.json();
                    alert(data.message || 'Failed to cast vote');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('An error occurred while casting your vote');
            }
        });
    });
}); 