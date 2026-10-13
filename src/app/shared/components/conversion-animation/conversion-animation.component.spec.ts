import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { AppConversionAnimationComponent } from './conversion-animation.component';

describe('AppConversionAnimationComponent', () => {
  let component: AppConversionAnimationComponent;
  let fixture: ComponentFixture<AppConversionAnimationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppConversionAnimationComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(AppConversionAnimationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should display source and target formats', () => {
    fixture.componentRef.setInput('sourceFormat', 'DOCX');
    fixture.componentRef.setInput('targetFormat', 'PDF');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('DOCX');
    expect(text).toContain('PDF');
  });

  it('should update progress and calculate step index', () => {
    fixture.componentRef.setInput('progress', 60);
    fixture.detectChanges();

    expect(component.stepIndex).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('60%');
  });

  it('should show success state when isSuccess is true', () => {
    fixture.componentRef.setInput('isSuccess', true);
    fixture.detectChanges();

    expect(component.stepIndex).toBe(3);
    const container = fixture.nativeElement.querySelector('.conversion-anim-container');
    expect(container.classList.contains('is-success')).toBe(true);
    expect(fixture.nativeElement.querySelector('.success-check-circle')).toBeTruthy();
  });
});
