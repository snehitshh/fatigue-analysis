function mountNASATLX(container, onComplete) {
    const questions = [
        {
            id: 'mentalDemand',
            title: 'Mental Demand',
            question: 'How mentally demanding was the task?',
            scale: '(1 = Very Low, 20 = Very High)'
        },
        {
            id: 'physicalDemand',
            title: 'Physical Demand',
            question: 'How physically demanding was the task?',
            scale: '(1 = Very Low, 20 = Very High)'
        },
        {
            id: 'temporalDemand',
            title: 'Temporal Demand',
            question: 'How hurried or rushed was the pace of the task?',
            scale: '(1 = Very Low, 20 = Very High)'
        },
        {
            id: 'performance',
            title: 'Performance',
            question: 'How successful were you in accomplishing what you were asked to do?',
            scale: '(1 = Perfect, 20 = Failure)'
        },
        {
            id: 'effort',
            title: 'Effort',
            question: 'How hard did you have to work to accomplish your level of performance?',
            scale: '(1 = Very Low, 20 = Very High)'
        },
        {
            id: 'frustration',
            title: 'Frustration',
            question: 'How insecure, discouraged, irritated, stressed, and annoyed were you?',
            scale: '(1 = Very Low, 20 = Very High)'
        }
    ];
    
    container.innerHTML = `
        <div class="nasatlx-container">
            <div class="block-title">NASA-TLX Workload Assessment</div>
            <p class="nasatlx-instruction">Please rate your experience with the previous task by adjusting the sliders below:</p>
            
            <form id="nasatlx-form">
                ${questions.map(q => `
                    <div class="nasatlx-question" style="margin-bottom: 25px; background: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
                        <label class="nasatlx-label" style="display: block; margin-bottom: 15px;">
                            <strong style="font-size: 1.1em; color: #111827;">${q.title}</strong><br>
                            <span style="color: #374151;">${q.question}</span><br>
                            <span class="scale-note" style="color: #6b7280; font-size: 0.85em;">${q.scale}</span>
                        </label>
                        
                        <div class="slider-wrapper" style="display: flex; align-items: center; gap: 15px;">
                            <span style="font-weight: bold; color: #9ca3af; font-size: 0.9em;">1</span>
                            
                            <input type="range" name="${q.id}" min="1" max="20" step="1" value="10" 
                                   class="nasatlx-slider" data-val-target="val-${q.id}" 
                                   style="flex-grow: 1; cursor: pointer;">
                                   
                            <span style="font-weight: bold; color: #9ca3af; font-size: 0.9em;">20</span>
                        </div>
                        
                        <div style="text-align: center; margin-top: 10px; font-weight: 600; color: #2563eb; font-size: 1.1em;">
                            Selected: <span id="val-${q.id}">10</span>
                        </div>
                    </div>
                `).join('')}
                
                <button type="submit" class="button primary" id="submit-btn" style="width: 100%; margin-top: 15px; font-size: 1.1em; padding: 12px;">
                    Submit Assessment
                </button>
            </form>
        </div>
    `;

    // Modern CSS for the Sliders
    if (!window.__nasatlxSliderCSS) {
        const style = document.createElement('style');
        style.textContent = `
            .nasatlx-slider {
                -webkit-appearance: none;
                width: 100%;
                height: 8px;
                border-radius: 4px;
                background: #d1d5db;
                outline: none;
            }
            .nasatlx-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: #2563eb;
                cursor: pointer;
                transition: background .15s ease-in-out, transform .1s;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
            .nasatlx-slider::-webkit-slider-thumb:hover {
                background: #1d4ed8;
                transform: scale(1.15);
            }
            .nasatlx-slider::-moz-range-thumb {
                width: 24px;
                height: 24px;
                border: none;
                border-radius: 50%;
                background: #2563eb;
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
        `;
        document.head.appendChild(style);
        window.__nasatlxSliderCSS = true;
    }

    const sliders = container.querySelectorAll('.nasatlx-slider');
    const form = document.getElementById('nasatlx-form');

    // Update the displayed value text instantly when the user drags the slider
    sliders.forEach(slider => {
        slider.addEventListener('input', (e) => {
            const targetId = e.target.dataset.valTarget;
            document.getElementById(targetId).textContent = e.target.value;
        });
    });

    // Individual CSV Download function
    function downloadNASACSV(data) {
        const headers = Object.keys(data).join(",");
        const values = Object.values(data).join(",");
        const csvContent = headers + "\n" + values;
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `nasatlx_report_${new Date().getTime()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const responses = {};
        let totalScore = 0;
        
        // Loop through all sliders to gather their final values
        sliders.forEach(slider => {
            const value = parseInt(slider.value);
            responses[slider.name] = value;
            totalScore += value;
        });

        // Calculate and append the overall score
        responses.overallScore = (totalScore / questions.length).toFixed(2);
        responses.timestamp = new Date().toISOString();

        // Trigger immediate download
        downloadNASACSV(responses);

        // Move to the next step
        onComplete(responses);
    });
}