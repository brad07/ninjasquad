#[cfg(test)]
pub mod mocks {
    use std::process::{Output, ExitStatus};
    use std::os::unix::process::ExitStatusExt;

    pub fn mock_successful_output() -> Output {
        Output {
            status: ExitStatus::from_raw(0),
            stdout: b"Success".to_vec(),
            stderr: Vec::new(),
        }
    }

    pub fn mock_failed_output(error: &str) -> Output {
        Output {
            status: ExitStatus::from_raw(1),
            stdout: Vec::new(),
            stderr: error.as_bytes().to_vec(),
        }
    }

    pub struct MockProcessManager {
        pub should_succeed: bool,
        pub process_id: Option<u32>,
    }

    impl MockProcessManager {
        pub fn new(should_succeed: bool) -> Self {
            Self {
                should_succeed,
                process_id: if should_succeed { Some(12345) } else { None },
            }
        }
    }
}